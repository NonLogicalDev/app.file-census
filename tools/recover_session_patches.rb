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

# These built-in reads bridge source-formatting actions that were performed by
# shell commands rather than patches. The tracked candidate index adds direct,
# hash-verified historical reads without trusting copied conversation context.
BUILTIN_TRUSTED_SOURCE_READS = {
  "call_EDYdmvPoHX5QGMJ5Nd32YbA5" => { path: "src/main.rs", kind: :sed, max_lines: 220 },
  "call_TFaUXtNW4X3iK28aoB2ELqrn" => { path: "src/web.rs", kind: :sed, max_lines: 260 },
  "call_aVfE8TEf3Q2dr1lCaYjAebk1" => { path: "src/scanner.rs", kind: :sed, max_lines: 260 },
  "call_ZIRBMkg1IyOMiyTu0gl4L36p" => { path: "ui/src/App.svelte", kind: :sed, max_lines: 280 },
  "call_chEiTJKaZUa8lD3fYJY9VuBj" => { path: "src/db.rs", kind: :sed, max_lines: 320 },
  "call_ut9ZUNDDe37PG4YgGQ4yEPLT" => { path: "ui/src/style.css", kind: :sed, max_lines: 240 },
  "call_DHQxEiP3sbicvVIBsjNUUAg9" => { path: "src/web.rs", kind: :sed, max_lines: 280 },
  "call_zikbU94Tq1zIPSmer8nFsQgK" => { path: "ui/src/App.svelte", kind: :sed, max_lines: 360 },
  "call_H7JbyzG4R1B7OSCo7giL4JPA" => { path: "ui/src/main.jsx", kind: :sed },
  "call_yTACncaaw4xj01W4mhN5XbvW" => { path: "ui/src/components/Shell.jsx", kind: :sed },
  "call_93Y00JB75AnkHCLtxCt51NYz" => { path: "ui/src/components/FileExplorer.jsx", kind: :sed },
  "call_nWqWClgB5psPamM5lXSpa4oj" => { path: "ui/src/components/FileGrid.jsx", kind: :sed },
  "call_4ITVx1bR5B9pwOg4cjcFs7NT" => { path: "ui/src/components/AppModals.jsx", kind: :sed },
  "call_qtJTNlDuemMmKIoZ5OzS3ajL" => { path: "ui/src/components/ui/index.jsx", kind: :sed },
  "call_mucT6DTjSHsAHeF6ZptkghHT" => { path: "ui/src/components/ui/Menu.jsx", kind: :sed },
  "call_oqvNr8vL3z88fDL5zX8hKIhT" => { path: "ui/src/components/ui/Button.jsx", kind: :sed },
  "call_0LXJW3vOkNEmxagW25JET6j2" => { path: "ui/src/pages/LocationsPage.jsx", kind: :sed },
  "call_AKqbNNRfmOPjSFYeZ2ufhIJK" => { path: "ui/src/pages/SearchPage.jsx", kind: :sed },
  "call_xBEyk8wb5N7Ymw7sZLSVFQd9" => { path: "ui/src/pages/DuplicatesPage.jsx", kind: :sed },
  "call_56XKfsbsT5bFhliXaGzVln0w" => { path: "ui/src/pages/TasksPage.jsx", kind: :sed },
  "call_icZcuhzC5P1ifGbNZzbtQMNZ" => { path: "src/backend/src/app.rs", kind: :sed },
  "call_21LylkIDBDRCEChYb9Q21pju" => { path: "src/backend/src/media.rs", kind: :sed },
  "call_TonMSZ8rBHIpQDwXJtH3UiIr" => { path: "src/backend/src/search.rs", kind: :sed },
  "call_kPO0BLFDCsB7m8Z4S58LaIqB" => { path: "src/backend/src/events.rs", kind: :sed },
  "call_c9QUWv72RXap0yDVK3r3b3Me" => { path: "src/backend/src/duplicate_cache.rs", kind: :sed },
  "call_X2AySBUzA08GP8hKoWL13Btl" => { path: "src/backend/src/main.rs", kind: :sed },
  "call_upuYXZVzDQzD6ql75lLxDcve" => { path: "src/backend/src/lib.rs", kind: :sed },
  "call_h44kRiE6J50VSa6kJvpshw9O" => { path: "src/backend/Cargo.toml", kind: :sed },
  "call_D2nvI6yZbeefvgn9XIZZX79F" => { path: "src/backend/build.rs", kind: :sed },
  "call_YO8YfZzms44GuK6adhja8RVR" => { path: "Cargo.toml", kind: :sed },
  "call_P0JtXFd7w8Gd97kLBYEdo5F8" => { path: "ui/vite.config.js", kind: :sed },
  "call_mT3SWzWPz5KznWEoqUe4Bdqi" => { path: "Justfile", kind: :sed },
  "call_96ohr5mbX4ZXwrSUjivkyrqN" => { path: "ui/src/prototypes/redesign/screens/LocationScreen.jsx", kind: :sed },
  "call_Sao8nwv5rHy3V7N95bzL9Pfv" => {
    path: "ui/package.json",
    kind: :json_before_diff,
    tool: :custom_exec,
    command: "cat ui/package.json && git diff --check && git diff -- ui/src/App.jsx ui/src/App.structure.test.js",
  },
}.freeze
SNAPSHOT_CANDIDATE_FILE = File.join(__dir__, "recovery_snapshot_candidates.json")

class RecoveryError < StandardError; end

def candidate_snapshot_reads
  return {} unless File.file?(SNAPSHOT_CANDIDATE_FILE)

  data = JSON.parse(File.read(SNAPSHOT_CANDIDATE_FILE))
  data.fetch("snapshots").each_with_object({}) do |entry, reads|
    call_id = entry.fetch("call_id")
    raise RecoveryError, "duplicate candidate snapshot call: #{call_id}" if reads.key?(call_id)

    command = entry.fetch("command")
    reads[call_id] = {
      path: entry.fetch("path"),
      kind: command.start_with?("sed -n ") ? :sed : :full,
      command: command,
      expected_source_log: entry.fetch("source_log"),
      expected_source_line: entry.fetch("source_line"),
      output_lines: entry.fetch("output_lines"),
      sha256: entry.fetch("sha256"),
    }
  end
rescue JSON::ParserError, KeyError, TypeError => error
  raise RecoveryError, "invalid snapshot candidate index: #{error.message}"
end

def trusted_source_reads
  @trusted_source_reads ||= BUILTIN_TRUSTED_SOURCE_READS.merge(candidate_snapshot_reads).freeze
end

def trusted_source_read_pattern
  @trusted_source_read_pattern ||= Regexp.union(trusted_source_reads.keys).freeze
end

Options = Struct.new(
  :sessions_glob,
  :historical_root,
  :cutoff,
  :output,
  :keep_partial,
  :include_generated,
  :snapshot_horizons,
  :snapshot_only,
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
    snapshot_horizons: false,
    snapshot_only: false,
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
    opts.on("--snapshot-horizons", "Use the newest verified source snapshot per path, then exact later changes") { options.snapshot_horizons = true }
    opts.on("--snapshot-only", "Write only the newest verified source snapshot per path") { options.snapshot_only = true }
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

def source_read_request_from_arguments(arguments, trusted, historical_root)
  command = arguments["cmd"].to_s
  expected_command = trusted[:command]&.gsub("<historical-root>", historical_root)
  if expected_command && command == expected_command
    request = trusted.dup
    if (match = command.match(/\Ased -n '1,(\d+)p /))
      request[:max_lines] ||= match[1].to_i
    end
    return request
  end

  return nil unless arguments["workdir"] == historical_root

  if (match = command.match(/\Acat ([A-Za-z0-9_.\/-]+)\z/))
    path = command_relative_path(match[1], historical_root)
    return path == trusted[:path] && trusted.dup
  end
  if (match = command.match(/\Ased -n '1,(\d+)p' ([A-Za-z0-9_.\/-]+)\z/))
    path = command_relative_path(match[2], historical_root)
    return nil unless path == trusted[:path]
    return nil if trusted[:max_lines] && match[1].to_i != trusted[:max_lines]

    return trusted.merge(max_lines: match[1].to_i)
  end
  nil
end

def source_read_request(payload, historical_root)
  trusted = trusted_source_reads[payload["call_id"]]
  return nil unless trusted

  if payload["type"] == "function_call" && payload["name"] == "exec_command"
    return source_read_request_from_arguments(JSON.parse(payload["arguments"]), trusted, historical_root)
  end
  if payload["type"] == "custom_tool_call" && payload["name"] == "exec"
    payload["input"].to_s.scan(/tools\.exec_command\((\{.*?\})\)/m) do |match|
      arguments = JSON.parse(match.first) rescue next
      request = source_read_request_from_arguments(arguments, trusted, historical_root)
      return request if request
    end

    payload["input"].to_s.scan(/tools\.exec_command\(\{(.*?)\}\)/m) do |match|
      object = match.first
      command = object.match(/"?cmd"?\s*:\s*("(?:\\.|[^"\\])*")/)
      workdir = object.match(/"?workdir"?\s*:\s*("(?:\\.|[^"\\])*")/)
      next unless command && workdir

      arguments = { "cmd" => JSON.parse(command[1]), "workdir" => JSON.parse(workdir[1]) }
      request = source_read_request_from_arguments(arguments, trusted, historical_root)
      return request if request
    end
  end
  nil
rescue JSON::ParserError
  nil
end

def output_text(output)
  return output if output.is_a?(String)
  return nil unless output.is_a?(Array)

  output.each_with_object(String.new) do |block, text|
    text << block["text"].to_s if block.is_a?(Hash) && block["type"] == "input_text"
  end
end

def snapshot_content(output, request)
  text = output_text(output)
  return nil unless text
  return nil if text.include?("Warning: truncated") || text.include?("...truncated...")

  marker = "Output:\n"
  offset = text.index(marker)
  return nil unless offset

  content = text[(offset + marker.length)..]
  if request[:kind] == :json_before_diff
    content = content.split(/\ndiff --git /, 2).first
    JSON.parse(content)
  end
  return nil if request[:kind] == :sed && request[:max_lines] && content.lines.count >= request[:max_lines]
  return nil if request[:output_lines] && content.lines.count != request[:output_lines]
  return nil if request[:sha256] && Digest::SHA256.hexdigest(content) != request[:sha256]

  content
rescue JSON::ParserError
  nil
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
      next unless line.include?(BEGIN_PATCH) || trusted_source_read_pattern.match?(line)

      event = JSON.parse(line)
      payload = event["payload"] || {}
      next unless event["type"] == "response_item"
      next unless event["timestamp"] && event["timestamp"] < options.cutoff

      if (request = source_read_request(payload, options.historical_root))
        call_id = payload["call_id"]
        next unless call_id
        next if excluded_path?(request[:path], options.include_generated)
        next if request[:expected_source_log] && File.basename(session_file) != request[:expected_source_log]
        next if request[:expected_source_line] && line_number != request[:expected_source_line]
        request.merge!(source_file: session_file, source_line: line_number, timestamp: event["timestamp"])
        existing = read_requests[call_id]
        read_requests[call_id] = request if existing.nil? || [request[:timestamp], request[:source_file], request[:source_line]] < [existing[:timestamp], existing[:source_file], existing[:source_line]]
        next
      end

      if %w[function_call_output custom_tool_call_output].include?(payload["type"])
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

def record_sort_key(record)
  [record[:timestamp], record[:source_file], record[:source_line], record[:ordinal], record.fetch(:change_index, 0)]
end

def later_record?(candidate, baseline)
  (record_sort_key(candidate) <=> record_sort_key(baseline)) == 1
end

def change_paths(change)
  [change[:path], change[:move_to]].compact.uniq
end

def snapshot_horizon_replay(records)
  horizons = {}
  records.select { |record| record[:kind] == "snapshot" }.each do |record|
    path = record[:changes].fetch(0).fetch(:path)
    current = horizons[path]
    horizons[path] = record if current.nil? || later_record?(record, current)
  end

  replay = horizons.values.dup
  skipped_changes = 0
  records.reject { |record| record[:kind] == "snapshot" }.each do |record|
    record[:changes].each_with_index do |change, change_index|
      needs_replay = change_paths(change).any? do |path|
        horizon = horizons[path]
        horizon.nil? || later_record?(record, horizon)
      end
      if needs_replay
        replay << record.merge(changes: [change], change_index: change_index)
      else
        skipped_changes += 1
      end
    end
  end

  [replay.sort_by { |record| record_sort_key(record) }, horizons, skipped_changes]
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
  replay_records = records
  if options.snapshot_horizons || options.snapshot_only
    replay_records, horizons, skipped_changes = snapshot_horizon_replay(records)
    replay_records = horizons.values.sort_by { |record| record_sort_key(record) } if options.snapshot_only
    summary.merge!(
      recovery_mode: options.snapshot_only ? "latest-verified-snapshots" : "snapshot-horizons-plus-exact-patches",
      snapshot_horizon_paths: horizons.keys.sort,
      snapshot_horizon_count: horizons.length,
      replay_calls_after_horizons: replay_records.length,
      skipped_pre_horizon_changes: skipped_changes,
    )
  end

  unless options.output
    puts JSON.pretty_generate(summary)
    exit
  end

  state = {}
  applied = 0
  conflict = nil
  replay_records.each do |record|
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
