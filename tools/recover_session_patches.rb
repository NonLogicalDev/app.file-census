#!/usr/bin/env ruby
# frozen_string_literal: true

# Reconstructs only source changes that can be proved from Codex session logs.
#
# It deliberately reads direct tool-call inputs rather than `patch_apply_end`
# messages: nested sessions can embed those messages as copied conversation
# context.  A replay is strict—each hunk must match exactly at its recorded
# position when a position is recorded. Unnumbered context anchors are matched
# exactly and in source order; no recovered source is ever written to the
# checkout.

require "digest"
require "fileutils"
require "json"
require "optparse"

DEFAULT_HISTORICAL_ROOT = "/Users/nonlogical/Projects/local/file-census"
DEFAULT_CUTOFF = "2026-07-15T05:35:46.541Z"
DEFAULT_SESSIONS = File.join(Dir.home, ".codex", "sessions", "2026", "{05,06,07}", "**", "*.jsonl")
BEGIN_PATCH = "*** Begin Patch"
END_PATCH = "*** End Patch"

# These reads are proven complete historical source snapshots: each command
# requested more lines than its output contained after `cargo fmt`. They bridge
# source formatting actions that were performed by shell commands rather than
# by patches. Keep this allowlist intentionally small and evidence-backed.
TRUSTED_SOURCE_READS = {
  "call_EDYdmvPoHX5QGMJ5Nd32YbA5" => { path: "src/main.rs", kind: :sed, max_lines: 220 },
  "call_TFaUXtNW4X3iK28aoB2ELqrn" => { path: "src/web.rs", kind: :sed, max_lines: 260 },
  "call_aVfE8TEf3Q2dr1lCaYjAebk1" => { path: "src/scanner.rs", kind: :sed, max_lines: 260 },
  "call_ZIRBMkg1IyOMiyTu0gl4L36p" => { path: "ui/src/App.svelte", kind: :sed, max_lines: 280 },
  "call_chEiTJKaZUa8lD3fYJY9VuBj" => { path: "src/db.rs", kind: :sed, max_lines: 320 },
  "call_ut9ZUNDDe37PG4YgGQ4yEPLT" => { path: "ui/src/style.css", kind: :sed, max_lines: 240 },
}.freeze

class RecoveryError < StandardError; end

Options = Struct.new(
  :sessions_glob,
  :historical_root,
  :cutoff,
  :output,
  :keep_partial,
  :include_generated,
  keyword_init: true,
)

def options_from(argv)
  options = Options.new(
    sessions_glob: DEFAULT_SESSIONS,
    historical_root: DEFAULT_HISTORICAL_ROOT,
    cutoff: DEFAULT_CUTOFF,
    output: nil,
    keep_partial: false,
    include_generated: false,
  )

  parser = OptionParser.new do |opts|
    opts.banner = <<~USAGE
      Usage: ruby tools/recover_session_patches.rb [options]

      Without --output, prints a read-only historical patch manifest.
      With --output, writes a new temporary recovery tree only after an exact
      replay. It never writes to the active checkout.
    USAGE
    opts.on("--sessions GLOB", "JSONL glob to inspect") { |value| options.sessions_glob = value }
    opts.on("--historical-root PATH", "Historical checkout path in patch records") { |value| options.historical_root = value }
    opts.on("--cutoff ISO8601", "Exclude events at or after this timestamp") { |value| options.cutoff = value }
    opts.on("--output PATH", "New directory for a recovered temporary tree") { |value| options.output = value }
    opts.on("--keep-partial", "Write a clearly partial tree after the first strict conflict") { options.keep_partial = true }
    opts.on("--include-generated", "Include target/, node_modules/, and ui/dist/ records") { options.include_generated = true }
    opts.on("-h", "--help", "Show this help") { puts opts; exit }
  end
  parser.parse!(argv)
  raise RecoveryError, "--keep-partial requires --output" if options.keep_partial && options.output.nil?
  options
end

def safe_relative_path(path, historical_root)
  root = historical_root.delete_suffix("/")
  return nil unless path.start_with?("#{root}/")

  relative = path.delete_prefix("#{root}/")
  return nil if relative.empty?

  segments = relative.split("/")
  return nil if segments.any? { |segment| segment.empty? || segment == "." || segment == ".." }

  relative
end

def excluded_path?(relative, include_generated)
  return false if include_generated

  relative == ".git" || relative.start_with?(".git/") ||
    relative == "target" || relative.start_with?("target/") ||
    relative == "node_modules" || relative.start_with?("node_modules/") ||
    relative == "ui/node_modules" || relative.start_with?("ui/node_modules/") ||
    relative == "ui/dist" || relative.start_with?("ui/dist/")
end

def patch_blocks(text)
  blocks = []
  offset = 0
  while (start = text.index(BEGIN_PATCH, offset))
    finish = text.index(END_PATCH, start)
    break unless finish

    blocks << text[start...(finish + END_PATCH.length)]
    offset = finish + END_PATCH.length
  end
  blocks
end

def json_string_literals(text)
  text.scan(/"(?:\\.|[^"\\])*"/m).each_with_object([]) do |literal, strings|
    strings << JSON.parse(literal)
  rescue JSON::ParserError
    next
  end
end

def candidate_patch_blocks(name, input)
  texts = []
  texts << input if name == "apply_patch"
  texts << input if input.include?("\n")
  texts.concat(json_string_literals(input)) if name == "exec"
  texts.flat_map { |text| patch_blocks(text) }.uniq
end

def command_relative_path(raw_path, historical_root)
  path = raw_path.delete_prefix("./")
  absolute = path.start_with?("/") ? path : File.join(historical_root, path)
  safe_relative_path(absolute, historical_root)
end

def source_read_request(payload, historical_root)
  return nil unless payload["type"] == "function_call" && payload["name"] == "exec_command"
  trusted = TRUSTED_SOURCE_READS[payload["call_id"]]
  return nil unless trusted

  arguments = JSON.parse(payload["arguments"])
  return nil unless arguments["workdir"] == historical_root

  command = arguments["cmd"].to_s
  if (match = command.match(/\Acat ([A-Za-z0-9_.\/-]+)\z/))
    path = command_relative_path(match[1], historical_root)
    return path == trusted[:path] && trusted.dup
  end
  if (match = command.match(/\Ased -n '1,(\d+)p' ([A-Za-z0-9_.\/-]+)\z/))
    path = command_relative_path(match[2], historical_root)
    return path == trusted[:path] && trusted.dup if match[1].to_i == trusted[:max_lines]
  end
  nil
rescue JSON::ParserError
  nil
end

def snapshot_content(output, request)
  return nil unless output.is_a?(String)
  return nil if output.include?("Warning: truncated") || output.include?("...truncated...")

  marker = "Output:\n"
  offset = output.index(marker)
  return nil unless offset

  content = output[(offset + marker.length)..]
  return nil if request[:kind] == :sed && content.lines.count >= request[:max_lines]

  content
end

def parse_patch(patch, historical_root:, include_generated:)
  lines = patch.split("\n", -1)
  raise RecoveryError, "missing patch start" unless lines.shift == BEGIN_PATCH

  lines.pop while lines.last == ""
  raise RecoveryError, "missing patch end" unless lines.pop == END_PATCH

  changes = []
  index = 0
  while index < lines.length
    header = lines[index]
    case header
    when /\A\*\*\* Add File: (.+)\z/
      path = safe_relative_path(Regexp.last_match(1), historical_root)
      raise RecoveryError, "unsafe add path" unless path
      index += 1
      body = []
      while index < lines.length && !lines[index].start_with?("*** ")
        line = lines[index]
        raise RecoveryError, "add body without + prefix for #{path}" unless line.start_with?("+")

        body << line.delete_prefix("+")
        index += 1
      end
      next if excluded_path?(path, include_generated)
      changes << { type: "add", path: path, content: body.empty? ? "" : "#{body.join("\n")}\n" }
    when /\A\*\*\* Update File: (.+)\z/
      path = safe_relative_path(Regexp.last_match(1), historical_root)
      raise RecoveryError, "unsafe update path" unless path
      index += 1
      move_to = nil
      if index < lines.length && lines[index].start_with?("*** Move to: ")
        move_to = safe_relative_path(lines[index].delete_prefix("*** Move to: "), historical_root)
        raise RecoveryError, "unsafe move path" unless move_to

        index += 1
      end
      diff = []
      while index < lines.length && !lines[index].start_with?("*** ")
        diff << lines[index]
        index += 1
      end
      next if excluded_path?(path, include_generated) || (move_to && excluded_path?(move_to, include_generated))
      changes << { type: "update", path: path, move_to: move_to, diff: diff.join("\n") }
    when /\A\*\*\* Delete File: (.+)\z/
      path = safe_relative_path(Regexp.last_match(1), historical_root)
      raise RecoveryError, "unsafe delete path" unless path
      index += 1
      next if excluded_path?(path, include_generated)
      changes << { type: "delete", path: path }
    else
      raise RecoveryError, "unsupported patch directive: #{header.inspect}"
    end
  end
  changes
end

def collect_records(options)
  records = {}
  snapshots = {}
  read_requests = {}
  ignored = []
  scanned_files = 0
  scanned_lines = 0

  Dir.glob(options.sessions_glob).sort.each do |session_file|
    scanned_files += 1
    File.foreach(session_file).with_index(1) do |line, line_number|
      scanned_lines += 1
      next if line[0, 14] == '{"timestamp":"' && line[14, 24] >= options.cutoff
      next unless line.include?(BEGIN_PATCH) || TRUSTED_SOURCE_READS.keys.any? { |call_id| line.include?(call_id) }

      event = JSON.parse(line)
      payload = event["payload"] || {}
      next unless event["type"] == "response_item"
      next unless event["timestamp"] && event["timestamp"] < options.cutoff

      if (request = source_read_request(payload, options.historical_root))
        call_id = payload["call_id"]
        next unless call_id
        request.merge!(source_file: session_file, source_line: line_number, timestamp: event["timestamp"])
        existing = read_requests[call_id]
        read_requests[call_id] = request if existing.nil? || [request[:timestamp], request[:source_file], request[:source_line]] < [existing[:timestamp], existing[:source_file], existing[:source_line]]
        next
      end

      if payload["type"] == "function_call_output"
        request = read_requests[payload["call_id"]]
        next unless request && request[:source_file] == session_file
        content = snapshot_content(payload["output"], request)
        next unless content

        hash = Digest::SHA256.hexdigest(content)
        key = [payload["call_id"], request[:path], hash].join(":")
        record = {
          call_id: payload["call_id"],
          timestamp: event["timestamp"],
          source_file: session_file,
          source_line: line_number,
          ordinal: 0,
          patch_hash: hash,
          kind: "snapshot",
          changes: [{ type: "snapshot", path: request[:path], content: content }],
        }
        existing = snapshots[key]
        snapshots[key] = record if existing.nil? || [record[:timestamp], record[:source_file], record[:source_line]] < [existing[:timestamp], existing[:source_file], existing[:source_line]]
        next
      end

      next unless payload["type"] == "custom_tool_call"
      next unless %w[apply_patch exec].include?(payload["name"])
      next unless payload["input"].is_a?(String)

      candidate_patch_blocks(payload["name"], payload["input"]).each_with_index do |patch, ordinal|
        begin
          changes = parse_patch(
            patch,
            historical_root: options.historical_root,
            include_generated: options.include_generated,
          )
          next if changes.empty?
        rescue RecoveryError => error
          ignored << { file: session_file, line: line_number, call_id: payload["call_id"], reason: error.message }
          next
        end

        hash = Digest::SHA256.hexdigest(patch)
        call_id = payload["call_id"] || "no-call-id"
        key = [call_id, ordinal, hash].join(":")
        record = {
          call_id: call_id,
          timestamp: event["timestamp"],
          source_file: session_file,
          source_line: line_number,
          ordinal: ordinal,
          patch_hash: hash,
          changes: changes,
        }
        existing = records[key]
        records[key] = record if existing.nil? || [record[:timestamp], record[:source_file], record[:source_line]] < [existing[:timestamp], existing[:source_file], existing[:source_line]]
      end
    rescue JSON::ParserError
      # Session logs can contain non-JSON diagnostic fragments; they are not evidence.
      next
    end
  end

  all_records = records.values + snapshots.values
  [all_records.sort_by { |record| [record[:timestamp], record[:source_file], record[:source_line], record[:ordinal]] }, ignored, scanned_files, scanned_lines, snapshots.length]
end

def parse_hunks(diff)
  lines = diff.split("\n", -1)
  lines.pop if lines.last == ""
  hunks = []
  current = nil

  lines.each do |line|
    if line == "@@"
      current = { old_start: nil, old_count: nil, body: [] }
      hunks << current
    elsif (match = line.match(/\A@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/))
      current = { old_start: match[1].to_i, old_count: (match[2] || "1").to_i, body: [] }
      hunks << current
    elsif current && [" ", "+", "-"].include?(line[0])
      current[:body] << [line[0], line[1..]]
    elsif line == "\\ No newline at end of file"
      raise RecoveryError, "unsupported no-newline marker"
    else
      raise RecoveryError, "malformed unified diff line: #{line.inspect}"
    end
  end
  raise RecoveryError, "update without hunks" if hunks.empty?

  hunks
end

def apply_unified_diff(content, diff)
  lines = content.split("\n", -1)
  offset = 0
  unnumbered_cursor = 0
  parse_hunks(diff).each do |hunk|
    old_lines = hunk[:body].reject { |kind, _| kind == "+" }.map(&:last)
    new_lines = hunk[:body].reject { |kind, _| kind == "-" }.map(&:last)
    if hunk[:old_count] && old_lines.length != hunk[:old_count]
      raise RecoveryError, "hunk header count mismatch"
    end

    start = if hunk[:old_start]
      (hunk[:old_start].zero? ? 0 : hunk[:old_start] - 1) + offset
    else
      raise RecoveryError, "unanchored hunk has no old context" if old_lines.empty?
      candidates = (unnumbered_cursor..(lines.length - old_lines.length)).select do |candidate|
        lines.slice(candidate, old_lines.length) == old_lines
      end
      if candidates.empty?
        preview = old_lines.first(2).join(" | ")
        raise RecoveryError, "unanchored hunk context is missing after line #{unnumbered_cursor}: #{preview.inspect}"
      end
      candidates.first
    end
    actual = lines.slice(start, old_lines.length) || []
    raise RecoveryError, "hunk context mismatch at source line #{hunk[:old_start]}" unless actual == old_lines

    lines[start, old_lines.length] = new_lines
    offset += new_lines.length - old_lines.length
    unnumbered_cursor = start + new_lines.length unless hunk[:old_start]
  end
  lines.join("\n")
end

def apply_record(state, record)
  trial = state.dup
  record[:changes].each do |change|
    path = change[:path]
    case change[:type]
    when "add"
      raise RecoveryError, "add already exists: #{path}" if trial.key?(path)
      trial[path] = change[:content]
    when "delete"
      raise RecoveryError, "delete is missing: #{path}" unless trial.key?(path)
      trial.delete(path)
    when "update"
      raise RecoveryError, "update is missing: #{path}" unless trial.key?(path)
      content = change[:diff].empty? ? trial.fetch(path) : apply_unified_diff(trial.fetch(path), change[:diff])
      if change[:move_to]
        destination = change[:move_to]
        raise RecoveryError, "move destination exists: #{destination}" if trial.key?(destination)
        trial.delete(path)
        trial[destination] = content
      else
        trial[path] = content
      end
    when "snapshot"
      trial[path] = change[:content]
    else
      raise RecoveryError, "unknown change type: #{change[:type]}"
    end
  end
  trial
end

def write_tree(output, state, report)
  raise RecoveryError, "output already exists: #{output}" if File.exist?(output)

  FileUtils.mkdir_p(output)
  state.sort.each do |relative, content|
    destination = File.expand_path(relative, output)
    raise RecoveryError, "unsafe output path: #{relative}" unless destination.start_with?("#{File.expand_path(output)}/")

    FileUtils.mkdir_p(File.dirname(destination))
    File.binwrite(destination, content)
  end
  File.write(File.join(output, "RECOVERY_REPORT.json"), JSON.pretty_generate(report))
end

def manifest(records, ignored, scanned_files, scanned_lines, options)
  changes = records.flat_map { |record| record[:changes] }
  {
    historical_root: options.historical_root,
    cutoff: options.cutoff,
    scanned_files: scanned_files,
    scanned_lines: scanned_lines,
    recovered_calls: records.length,
    historical_snapshots: records.count { |record| record[:kind] == "snapshot" },
    recovered_changes: changes.length,
    unique_paths: changes.map { |change| change[:path] }.uniq.length,
    first_event: records.first&.slice(:timestamp, :call_id, :source_file, :source_line),
    last_event: records.last&.slice(:timestamp, :call_id, :source_file, :source_line),
    ignored_patch_records: ignored.length,
  }
end

begin
  options = options_from(ARGV)
  records, ignored, scanned_files, scanned_lines, = collect_records(options)
  summary = manifest(records, ignored, scanned_files, scanned_lines, options)

  unless options.output
    puts JSON.pretty_generate(summary)
    exit
  end

  state = {}
  applied = 0
  conflict = nil
  records.each do |record|
    state = apply_record(state, record)
    applied += 1
  rescue RecoveryError => error
    conflict = record.slice(:timestamp, :call_id, :source_file, :source_line, :ordinal).merge(reason: error.message)
    break
  end

  report = summary.merge(
    applied_calls: applied,
    recovered_files: state.length,
    conflict: conflict,
    ignored_samples: ignored.first(5),
  )
  if conflict && !options.keep_partial
    warn JSON.pretty_generate(report)
    warn "No tree written: rerun with --keep-partial to inspect the strict partial replay."
    exit 2
  end

  write_tree(options.output, state, report)
  puts JSON.pretty_generate(report.merge(output: options.output))
  exit(conflict ? 2 : 0)
rescue RecoveryError, OptionParser::ParseError => error
  warn "recovery error: #{error.message}"
  exit 1
end
