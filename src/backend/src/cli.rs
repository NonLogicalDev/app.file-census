use std::io::{IsTerminal, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{ArgAction, Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;

use file_census_backend::app;
use file_census_backend::db::{
    build_scan_exclude_matcher, Database, LocationInput, LocationType, LocationUpdate,
};
use file_census_backend::events::{AppEvent, EventHub};
use file_census_backend::search::{
    FileSearchExpression, FileSearchFilter, FileSearchOperator, FileSearchQuery, FileSearchTerm,
};
use file_census_backend::{media, paths, scanner};

#[derive(Parser)]
#[command(author, version, about)]
pub struct Cli {
    /// SQLite database file used for file-census state.
    #[arg(long, global = true)]
    pub db: Option<PathBuf>,

    /// Print structured JSON output for script usage.
    #[arg(long, global = true)]
    pub json: bool,

    /// Target a running file-census server for live process commands.
    #[arg(long, global = true)]
    pub server: Option<String>,

    /// Increase diagnostic logging. Repeat for debug/trace detail.
    #[arg(short, long, global = true, action = ArgAction::Count)]
    pub verbose: u8,

    #[command(subcommand)]
    pub command: Option<Command>,
}

impl Cli {
    pub fn db_path(&self) -> Result<PathBuf> {
        self.db
            .clone()
            .map(Ok)
            .unwrap_or_else(paths::default_db_path)
    }
}

#[derive(Subcommand)]
pub enum Command {
    /// Show database-level counts.
    Overview,
    /// Manage registered scan locations.
    #[command(alias = "location")]
    Locations(LocationCommand),
    /// Manage scans.
    Scans(ScansCommand),
    /// Legacy shortcut: scan a registered location into a new snapshot.
    Scan(ScanArgs),
    /// Search indexed paths and filenames.
    Find(FindArgs),
    /// Work with indexed files.
    Files(FilesCommand),
    /// Legacy shortcut: show exact content duplicate groups.
    Dupes(DupesArgs),
    /// Show exact content duplicate groups.
    Duplicates(DuplicatesCommand),
    /// Build cached thumbnails.
    Thumbnails(ThumbnailsCommand),
    /// Run optional file enrichment processors.
    FileExtraInfo(FileExtraInfoCommand),
    /// Serve the embedded web UI.
    Serve(ServeArgs),
}

#[derive(Args)]
pub struct LocationCommand {
    #[command(subcommand)]
    command: LocationSubcommand,
}

#[derive(Subcommand)]
enum LocationSubcommand {
    /// Add a local path, disk, or NAS location.
    Add(AddLocationArgs),
    /// List locations.
    List,
    /// Check whether registered location paths are currently reachable.
    Liveness(LocationLivenessArgs),
    /// Open a location or child folder in the system file browser.
    OpenFolder(LocationFolderActionArgs),
    /// Update location metadata.
    Update(UpdateLocationArgs),
    /// Include a location in duplicate detection.
    Enable(LocationSlugArgs),
    /// Exclude a location from duplicate detection.
    Disable(LocationSlugArgs),
    /// Delete a location and its indexed scans.
    Delete(DeleteLocationArgs),
}

#[derive(Args)]
struct AddLocationArgs {
    #[arg(value_enum)]
    kind: Option<LocationKind>,
    #[arg(long)]
    name: Option<String>,
    #[arg(long)]
    slug: String,
    #[arg(long)]
    path: PathBuf,
    #[arg(long)]
    notes: Option<String>,
}

#[derive(Args)]
struct UpdateLocationArgs {
    slug: String,
    #[arg(long, value_enum)]
    kind: Option<LocationKind>,
    #[arg(long)]
    name: Option<String>,
    #[arg(long)]
    path: Option<PathBuf>,
    #[arg(long)]
    notes: Option<String>,
    #[arg(long)]
    clear_notes: bool,
}

#[derive(Args)]
struct LocationSlugArgs {
    slug: String,
}

#[derive(Args)]
struct DeleteLocationArgs {
    slug: String,
    /// Confirm deletion without prompting.
    #[arg(long)]
    yes: bool,
}

#[derive(Args)]
struct LocationLivenessArgs {
    slug: Option<String>,
}

#[derive(Args)]
struct LocationFolderActionArgs {
    slug: String,
    #[arg(long, default_value = "")]
    path: String,
}

#[derive(Clone, ValueEnum)]
enum LocationKind {
    Unknown,
    Local,
    Disk,
    Nas,
}

impl From<LocationKind> for LocationType {
    fn from(value: LocationKind) -> Self {
        match value {
            LocationKind::Unknown => LocationType::Unknown,
            LocationKind::Local => LocationType::Local,
            LocationKind::Disk => LocationType::Disk,
            LocationKind::Nas => LocationType::Nas,
        }
    }
}

#[derive(Args)]
pub struct ScansCommand {
    #[command(subcommand)]
    command: ScanSubcommand,
}

#[derive(Subcommand)]
enum ScanSubcommand {
    /// List scans.
    List,
    /// Benchmark metadata-aware filesystem discovery without hashing or DB writes.
    BenchmarkDiscovery(DiscoveryBenchmarkArgs),
    /// List scans currently running in a targeted server process.
    Running,
    /// Scan a registered location into a new snapshot and wait for completion.
    Start(ScanArgs),
    /// Update a scan by re-reading missing or incomplete information.
    Update(ScanIdArgs),
    /// Repair a scan by re-scanning and filling incomplete entries.
    Repair(ScanIdArgs),
    /// Ask a running server process to pause an active scan.
    Pause(ScanIdArgs),
    /// Ask a running server process to resume a paused scan.
    Resume(ScanIdArgs),
    /// Ask a running server process to stop an active scan.
    Stop(ScanIdArgs),
    /// Show live progress for a scan in a targeted server process.
    Progress(ScanIdArgs),
    /// Show the file tree for a scan.
    Tree(TreeArgs),
    /// Check whether selected files/folder are present elsewhere.
    DeleteCheck(DeleteCheckArgs),
    /// Add, update, or clear notes for a scan.
    Notes(ScanNotesArgs),
    /// Add or update the short nickname for a scan.
    Nickname(ScanNicknameArgs),
    /// Manage scan exclude patterns.
    Excludes(ScanExcludesCommand),
    /// Delete a scan and its indexed rows.
    Delete(DeleteScanArgs),
    /// Delete an indexed file or folder path from a scan.
    DeletePath(DeleteScanPathArgs),
    /// Mark a scan as the representative scan for its location.
    SetRepresentative(ScanIdArgs),
    /// Clear a scan as the representative scan for its location.
    ClearRepresentative(ScanIdArgs),
}

#[derive(Args)]
pub struct ScanArgs {
    /// Location slug to scan.
    slug: String,
    /// Optional subpath under the location root.
    #[arg(long, default_value = "/")]
    offset: PathBuf,
    /// Content hash work to run during the scan.
    #[arg(long, value_enum, default_value_t = ScanHashModeArg::Full)]
    hash_mode: ScanHashModeArg,
    /// Build EXIF metadata as a follow-up extra-info task after the scan completes.
    #[arg(long)]
    scan_exif: bool,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum ScanHashModeArg {
    Full,
    Light,
    Both,
}

impl From<ScanHashModeArg> for scanner::ScanHashMode {
    fn from(value: ScanHashModeArg) -> Self {
        match value {
            ScanHashModeArg::Full => scanner::ScanHashMode::Full,
            ScanHashModeArg::Light => scanner::ScanHashMode::Light,
            ScanHashModeArg::Both => scanner::ScanHashMode::Both,
        }
    }
}

#[derive(Args)]
struct ScanIdArgs {
    scan_id: String,
}

#[derive(Args)]
struct TreeArgs {
    scan_id: String,
    #[arg(long, default_value = "")]
    path: String,
    /// Maximum entries to return for this folder page.
    #[arg(long, default_value_t = 500)]
    limit: u32,
    /// Entry offset within this folder page.
    #[arg(long, default_value_t = 0)]
    offset: u32,
    /// Folder traversal depth. Use 1 for current folder and 0 for recursive.
    #[arg(long, default_value_t = 1)]
    depth: u32,
}

#[derive(Args)]
struct DiscoveryBenchmarkArgs {
    /// Filesystem path to discover.
    path: PathBuf,
    /// Number of traversal threads. Defaults to the platform scanner setting.
    #[arg(long)]
    threads: Option<usize>,
    /// Request traversal stop after this many milliseconds.
    #[arg(long)]
    stop_after_ms: Option<u64>,
    /// Scan exclude pattern to apply. Repeat for multiple patterns.
    #[arg(long = "exclude")]
    excludes: Vec<String>,
}

#[derive(Args)]
struct DeleteCheckArgs {
    scan_id: String,
    #[arg(long)]
    path: Option<String>,
    #[arg(long = "paths")]
    paths: Vec<String>,
}

#[derive(Args)]
struct ScanNotesArgs {
    scan_id: String,
    #[arg(long)]
    notes: Option<String>,
    #[arg(long)]
    clear: bool,
}

#[derive(Args)]
struct ScanNicknameArgs {
    scan_id: String,
    nickname: String,
}

#[derive(Args)]
struct ScanExcludesCommand {
    #[command(subcommand)]
    command: ScanExcludesSubcommand,
}

#[derive(Subcommand)]
enum ScanExcludesSubcommand {
    /// List exclude patterns for a scan.
    Get(ScanIdArgs),
    /// Replace exclude patterns for a scan.
    Set(SetScanExcludesArgs),
}

#[derive(Args)]
struct SetScanExcludesArgs {
    scan_id: String,
    patterns: Vec<String>,
}

#[derive(Args)]
struct DeleteScanArgs {
    scan_id: String,
    /// Confirm deletion without prompting.
    #[arg(long)]
    yes: bool,
}

#[derive(Args)]
struct DeleteScanPathArgs {
    scan_id: String,
    path: String,
}

#[derive(Args)]
pub struct FindArgs {
    query: String,
    #[arg(long, default_value_t = 50)]
    limit: u32,
}

#[derive(Args)]
pub struct FilesCommand {
    #[command(subcommand)]
    command: FilesSubcommand,
}

#[derive(Subcommand)]
enum FilesSubcommand {
    /// Search indexed paths and filenames.
    Find(FindArgs),
    /// Search indexed files with structured filters.
    Search(FileSearchArgs),
    /// Show all details and occurrences for a content hash.
    Details(FileDetailsArgs),
    /// Open an indexed file or folder in the system file browser.
    Open(FilePathActionArgs),
    /// Reveal an indexed file or folder in the system file browser.
    Reveal(FilePathActionArgs),
}

#[derive(Args)]
struct FileDetailsArgs {
    #[arg(long)]
    blake3: String,
    #[arg(long)]
    size: u64,
}

#[derive(Args)]
struct FilePathActionArgs {
    location_slug: String,
    path: String,
}

#[derive(Args)]
struct FileSearchArgs {
    /// Direct structured FileSearchQuery JSON payload.
    #[arg(long)]
    filter_json: Option<String>,
    /// Text contained in the indexed relative path or filename.
    #[arg(long)]
    text: Option<String>,
    /// Filename extension, with or without a leading dot.
    #[arg(long)]
    extension: Option<String>,
    /// Exact location slug.
    #[arg(long)]
    location_slug: Option<String>,
    /// Indexed row kind.
    #[arg(long, value_enum)]
    kind: Option<FileKindArg>,
    /// Match files modified at or after this RFC3339 timestamp.
    #[arg(long)]
    mtime_after: Option<String>,
    /// Match files modified at or before this RFC3339 timestamp.
    #[arg(long)]
    mtime_before: Option<String>,
    /// Maximum number of rows to return.
    #[arg(long)]
    limit: Option<u32>,
    /// Number of matching rows to skip.
    #[arg(long)]
    offset: Option<u32>,
}

#[derive(Clone, ValueEnum)]
enum FileKindArg {
    File,
    #[value(alias = "folder")]
    Dir,
}

impl From<FileKindArg> for &'static str {
    fn from(value: FileKindArg) -> Self {
        match value {
            FileKindArg::File => "file",
            FileKindArg::Dir => "dir",
        }
    }
}

#[derive(Args)]
pub struct DupesArgs {
    #[arg(long, default_value_t = 50)]
    limit: u32,
    /// Restrict duplicate detection to explicit scan ids. Repeat for multiple scans.
    #[arg(long = "scan-id")]
    scan_ids: Vec<String>,
}

#[derive(Args)]
pub struct DuplicatesCommand {
    #[command(subcommand)]
    command: DuplicatesSubcommand,
}

#[derive(Subcommand)]
enum DuplicatesSubcommand {
    /// List duplicate groups.
    List(DupesArgs),
}

#[derive(Args)]
pub struct ThumbnailsCommand {
    #[command(subcommand)]
    command: ThumbnailsSubcommand,
}

#[derive(Subcommand)]
enum ThumbnailsSubcommand {
    /// Build cached thumbnails for files in a scan.
    Build(BuildThumbnailsArgs),
}

#[derive(Args)]
struct BuildThumbnailsArgs {
    scan_id: String,
    #[arg(long, default_value = "")]
    path: String,
    #[arg(long = "paths")]
    paths: Vec<String>,
    #[arg(long)]
    recursive: bool,
}

#[derive(Args)]
pub struct FileExtraInfoCommand {
    #[command(subcommand)]
    command: FileExtraInfoSubcommand,
}

#[derive(Subcommand)]
enum FileExtraInfoSubcommand {
    /// Extract and persist EXIF metadata for indexed files in a scan.
    Exif(BuildFileExtraInfoArgs),
}

#[derive(Args)]
struct BuildFileExtraInfoArgs {
    scan_id: String,
    #[arg(long, default_value = "")]
    path: String,
    #[arg(long)]
    recursive: bool,
}

#[derive(Args, Clone)]
pub struct ServeArgs {
    #[arg(long, default_value_t = 3838)]
    pub port: u16,
    #[arg(long = "no-open", default_value_t = true, action = ArgAction::SetFalse)]
    pub open: bool,
}

pub enum RunOutcome {
    Done,
    Serve(ServeArgs),
}

pub fn default_serve_args() -> ServeArgs {
    ServeArgs {
        port: 3838,
        open: true,
    }
}

pub fn run_cli(cli: Cli, db_path: PathBuf) -> Result<RunOutcome> {
    let Some(command) = cli.command else {
        return Ok(RunOutcome::Serve(default_serve_args()));
    };
    let command_path = command_path(&command);
    let started = Instant::now();
    tracing::info!(
        target: "file_census::cli",
        command = command_path,
        db = %db_path.display(),
        json = cli.json,
        server = cli.server.as_deref().unwrap_or(""),
        "starting cli command"
    );

    let result = match command {
        Command::Serve(args) => Ok(RunOutcome::Serve(args)),
        Command::Overview => {
            let db = Database::open(&db_path)?;
            emit(&db.overview()?, cli.json, print_overview)?;
            Ok(RunOutcome::Done)
        }
        Command::Locations(command) => {
            run_locations(Database::open(&db_path)?, command, cli.json)?;
            Ok(RunOutcome::Done)
        }
        Command::Scans(command) => {
            run_scans(&db_path, command, cli.json, cli.server.as_deref())?;
            Ok(RunOutcome::Done)
        }
        Command::Scan(args) => {
            let db = Database::open(&db_path)?;
            let summary = scanner::scan_location(&db, &args.slug, &args.offset)?;
            emit(&summary, cli.json, print_scan_summary)?;
            Ok(RunOutcome::Done)
        }
        Command::Find(args) => {
            let db = Database::open(&db_path)?;
            let files = db.find_files(&args.query, args.limit)?;
            emit(&files, cli.json, |files| print_files(files))?;
            Ok(RunOutcome::Done)
        }
        Command::Files(command) => {
            run_files(Database::open(&db_path)?, command, cli.json)?;
            Ok(RunOutcome::Done)
        }
        Command::Dupes(args) => {
            let db = Database::open(&db_path)?;
            let groups = db.duplicate_groups_for_scans(args.limit, &args.scan_ids)?;
            emit(&groups, cli.json, |groups| print_duplicate_groups(groups))?;
            Ok(RunOutcome::Done)
        }
        Command::Duplicates(command) => {
            run_duplicates(Database::open(&db_path)?, command, cli.json)?;
            Ok(RunOutcome::Done)
        }
        Command::Thumbnails(command) => {
            run_thumbnails(Database::open(&db_path)?, command, cli.json)?;
            Ok(RunOutcome::Done)
        }
        Command::FileExtraInfo(command) => {
            run_file_extra_info(Database::open(&db_path)?, command, cli.json)?;
            Ok(RunOutcome::Done)
        }
    };

    match &result {
        Ok(_) => tracing::info!(
            target: "file_census::cli",
            command = command_path,
            elapsed_ms = started.elapsed().as_millis() as u64,
            "completed cli command"
        ),
        Err(error) => tracing::error!(
            target: "file_census::cli",
            command = command_path,
            elapsed_ms = started.elapsed().as_millis() as u64,
            error = %error,
            "failed cli command"
        ),
    }
    result
}

fn command_path(command: &Command) -> &'static str {
    match command {
        Command::Overview => "overview",
        Command::Locations(command) => match &command.command {
            LocationSubcommand::Add(_) => "locations.add",
            LocationSubcommand::List => "locations.list",
            LocationSubcommand::Liveness(_) => "locations.liveness",
            LocationSubcommand::OpenFolder(_) => "locations.open-folder",
            LocationSubcommand::Update(_) => "locations.update",
            LocationSubcommand::Enable(_) => "locations.enable",
            LocationSubcommand::Disable(_) => "locations.disable",
            LocationSubcommand::Delete(_) => "locations.delete",
        },
        Command::Scans(command) => match &command.command {
            ScanSubcommand::List => "scans.list",
            ScanSubcommand::BenchmarkDiscovery(_) => "scans.benchmark-discovery",
            ScanSubcommand::Running => "scans.running",
            ScanSubcommand::Start(_) => "scans.start",
            ScanSubcommand::Update(_) => "scans.update",
            ScanSubcommand::Repair(_) => "scans.repair",
            ScanSubcommand::Pause(_) => "scans.pause",
            ScanSubcommand::Resume(_) => "scans.resume",
            ScanSubcommand::Stop(_) => "scans.stop",
            ScanSubcommand::Progress(_) => "scans.progress",
            ScanSubcommand::Tree(_) => "scans.tree",
            ScanSubcommand::DeleteCheck(_) => "scans.delete-check",
            ScanSubcommand::Notes(_) => "scans.notes",
            ScanSubcommand::Nickname(_) => "scans.nickname",
            ScanSubcommand::Excludes(_) => "scans.excludes",
            ScanSubcommand::Delete(_) => "scans.delete",
            ScanSubcommand::DeletePath(_) => "scans.delete-path",
            ScanSubcommand::SetRepresentative(_) => "scans.set-representative",
            ScanSubcommand::ClearRepresentative(_) => "scans.clear-representative",
        },
        Command::Scan(_) => "scan",
        Command::Find(_) => "find",
        Command::Files(command) => match &command.command {
            FilesSubcommand::Find(_) => "files.find",
            FilesSubcommand::Search(_) => "files.search",
            FilesSubcommand::Details(_) => "files.details",
            FilesSubcommand::Open(_) => "files.open",
            FilesSubcommand::Reveal(_) => "files.reveal",
        },
        Command::Dupes(_) => "dupes",
        Command::Duplicates(command) => match &command.command {
            DuplicatesSubcommand::List(_) => "duplicates.list",
        },
        Command::Thumbnails(command) => match &command.command {
            ThumbnailsSubcommand::Build(_) => "thumbnails.build",
        },
        Command::FileExtraInfo(command) => match &command.command {
            FileExtraInfoSubcommand::Exif(_) => "file-extra-info.exif",
        },
        Command::Serve(_) => "serve",
    }
}

fn run_locations(db: Database, command: LocationCommand, json: bool) -> Result<()> {
    match command.command {
        LocationSubcommand::Add(args) => {
            let name = args.name.unwrap_or_else(|| args.slug.clone());
            let location = db.add_location(LocationInput {
                kind: args.kind.unwrap_or(LocationKind::Unknown).into(),
                name,
                slug: args.slug,
                root_path: args.path,
                notes: args.notes,
            })?;
            emit(&location, json, |location| {
                println!("added {} ({})", location.slug, location.id);
                Ok(())
            })
        }
        LocationSubcommand::List => {
            let locations = db.locations()?;
            emit(&locations, json, |locations| {
                for location in locations {
                    println!(
                        "{}\t{}\t{}\t{}",
                        location.slug,
                        location.kind,
                        location.name,
                        location.root_path.display()
                    );
                }
                Ok(())
            })
        }
        LocationSubcommand::Liveness(args) => {
            if let Some(slug) = args.slug {
                let location = app::location_liveness(&db, &slug)?;
                emit(&location, json, |location| {
                    print_location_liveness(std::slice::from_ref(location))
                })
            } else {
                let locations = app::locations_with_liveness(&db)?;
                emit(&locations, json, |locations| print_location_liveness(locations))
            }
        }
        LocationSubcommand::OpenFolder(args) => {
            let path = app::location_child_path(&db, &args.slug, &args.path)?;
            app::open_in_system(&path)?;
            let result = serde_json::json!({
                "opened": true,
                "slug": args.slug,
                "path": args.path,
                "resolved_path": path,
            });
            emit(&result, json, |result| {
                println!(
                    "opened {}",
                    result["resolved_path"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
        LocationSubcommand::Update(args) => {
            let current = db
                .location_by_slug(&args.slug)?
                .with_context(|| format!("location not found: {}", args.slug))?;
            let notes = if args.clear_notes {
                None
            } else {
                args.notes.or(current.notes)
            };
            let location = db.update_location(
                &args.slug,
                LocationUpdate {
                    kind: args.kind.map(Into::into).unwrap_or(current.kind),
                    name: args.name.unwrap_or(current.name),
                    root_path: args.path.unwrap_or(current.root_path),
                    notes,
                },
            )?;
            emit(&location, json, |location| {
                println!("updated {}", location.slug);
                Ok(())
            })
        }
        LocationSubcommand::Enable(args) => {
            let location = db.set_location_disabled(&args.slug, false)?;
            emit(&location, json, |location| {
                println!("enabled {}", location.slug);
                Ok(())
            })
        }
        LocationSubcommand::Disable(args) => {
            let location = db.set_location_disabled(&args.slug, true)?;
            emit(&location, json, |location| {
                println!("disabled {}", location.slug);
                Ok(())
            })
        }
        LocationSubcommand::Delete(args) => {
            if !args.yes {
                anyhow::bail!("refusing to delete location without --yes");
            }
            let deleted = db.delete_location(&args.slug)?;
            let result = serde_json::json!({ "slug": args.slug, "deleted": deleted });
            emit(&result, json, |result| {
                println!(
                    "{} {}",
                    if result["deleted"].as_bool().unwrap_or(false) {
                        "deleted"
                    } else {
                        "not found"
                    },
                    result["slug"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
    }
}

fn run_scans(
    db_path: &Path,
    command: ScansCommand,
    json: bool,
    server: Option<&str>,
) -> Result<()> {
    match command.command {
        ScanSubcommand::BenchmarkDiscovery(args) => {
            let matcher = build_scan_exclude_matcher(&args.excludes)?;
            let stats = scanner::benchmark_discovery(
                &args.path,
                matcher.as_ref(),
                args.threads,
                args.stop_after_ms.map(Duration::from_millis),
            )?;
            emit(&stats, json, print_discovery_stats)
        }
        ScanSubcommand::Running => run_server_scan_request(server, "scans.running", None, json),
        ScanSubcommand::Progress(args) => run_server_scan_request(
            server,
            "scans.progress",
            Some(serde_json::json!({ "scan_id": args.scan_id })),
            json,
        ),
        ScanSubcommand::Pause(args) => {
            run_server_scan_request(
                server,
                "scans.pause",
                Some(serde_json::json!({ "scan_id": args.scan_id })),
                json,
            )
        }
        ScanSubcommand::Resume(args) => {
            run_server_scan_request(
                server,
                "scans.resume",
                Some(serde_json::json!({ "scan_id": args.scan_id })),
                json,
            )
        }
        ScanSubcommand::Stop(args) => {
            run_server_scan_request(
                server,
                "scans.stop",
                Some(serde_json::json!({ "scan_id": args.scan_id })),
                json,
            )
        }
        ScanSubcommand::List => {
            let db = Database::open(db_path)?;
            let scans = db.scans()?;
            emit(&scans, json, |scans| print_scans(scans))
        }
        ScanSubcommand::Start(args) => {
            let db = Database::open(db_path)?;
            let prepared = scanner::prepare_scan_with_options(
                &db,
                &args.slug,
                &args.offset,
                scanner::ScanOptions {
                    hash_mode: args.hash_mode.into(),
                    scan_exif: args.scan_exif,
                },
            )?;
            run_prepared_scan_cli(&db, prepared, json)
        }
        ScanSubcommand::Update(args) => {
            let db = Database::open(db_path)?;
            let prepared = scanner::prepare_update_scan(&db, &args.scan_id)?;
            run_prepared_scan_cli(&db, prepared, json)
        }
        ScanSubcommand::Repair(args) => {
            let db = Database::open(db_path)?;
            let prepared = scanner::prepare_repair_scan(&db, &args.scan_id)?;
            run_prepared_scan_cli(&db, prepared, json)
        }
        ScanSubcommand::Tree(args) => {
            let db = Database::open(db_path)?;
            let tree = db.scan_tree_page(
                &args.scan_id,
                &args.path,
                Some(args.limit.max(1)),
                args.offset,
                args.depth,
                None,
            )?;
            emit(&tree, json, |tree| {
                for entry in &tree.entries {
                    println!(
                        "{}\t{}\t{}\t{}",
                        entry.kind, entry.size, entry.file_count, entry.path
                    );
                }
                if tree.has_more {
                    eprintln!(
                        "showing {} of {} entries; next offset: {}",
                        tree.entries.len(),
                        tree.total,
                        tree.next_offset.unwrap_or(tree.offset)
                    );
                }
                Ok(())
            })
        }
        ScanSubcommand::DeleteCheck(args) => {
            let db = Database::open(db_path)?;
            let result = if args.paths.is_empty() {
                db.delete_check(&args.scan_id, args.path.as_deref().unwrap_or(""))?
            } else {
                db.delete_check_paths(&args.scan_id, &args.paths)?
            };
            emit(&result, json, |result| {
                println!(
                    "{}: {} checked, {} missing",
                    if result.safe { "safe" } else { "unsafe" },
                    result.total_count,
                    result.missing_count
                );
                Ok(())
            })
        }
        ScanSubcommand::Notes(args) => {
            let db = Database::open(db_path)?;
            let notes = if args.clear { None } else { args.notes };
            let scan = db.update_scan_notes(&args.scan_id, notes)?;
            emit(&scan, json, |scan| {
                println!("updated notes for {}", scan.id);
                Ok(())
            })
        }
        ScanSubcommand::Nickname(args) => {
            let db = Database::open(db_path)?;
            let current = db
                .scan_by_id(&args.scan_id)?
                .with_context(|| format!("scan not found: {}", args.scan_id))?;
            let scan = db.update_scan_metadata(&args.scan_id, Some(args.nickname), current.notes)?;
            emit(&scan, json, |scan| {
                println!("renamed scan {} to {}", scan.id, scan.nickname);
                Ok(())
            })
        }
        ScanSubcommand::Excludes(args) => run_scan_excludes(Database::open(db_path)?, args, json),
        ScanSubcommand::Delete(args) => {
            let db = Database::open(db_path)?;
            if !args.yes {
                anyhow::bail!("refusing to delete scan without --yes");
            }
            let deleted = db.delete_scan(&args.scan_id)?;
            let result = serde_json::json!({ "scan_id": args.scan_id, "deleted": deleted });
            emit(&result, json, |result| {
                println!(
                    "{} {}",
                    if result["deleted"].as_bool().unwrap_or(false) {
                        "deleted"
                    } else {
                        "not found"
                    },
                    result["scan_id"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
        ScanSubcommand::DeletePath(args) => {
            let db = Database::open(db_path)?;
            let deleted = db.delete_scan_path(&args.scan_id, &args.path)?;
            let result = serde_json::json!({
                "scan_id": args.scan_id,
                "path": args.path,
                "deleted": deleted
            });
            emit(&result, json, |result| {
                println!(
                    "deleted {} rows from {}",
                    result["deleted"].as_u64().unwrap_or(0),
                    result["scan_id"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
        ScanSubcommand::SetRepresentative(args) => {
            let db = Database::open(db_path)?;
            let scan = db.set_representative_scan(&args.scan_id)?;
            emit(&scan, json, |scan| {
                println!("representative {}", scan.id);
                Ok(())
            })
        }
        ScanSubcommand::ClearRepresentative(args) => {
            let db = Database::open(db_path)?;
            let scan = db.clear_representative_scan(&args.scan_id)?;
            emit(&scan, json, |scan| {
                println!("cleared representative {}", scan.id);
                Ok(())
            })
        }
    }
}

fn run_prepared_scan_cli(
    db: &Database,
    prepared: scanner::PreparedScan,
    json: bool,
) -> Result<()> {
    if json {
        let summary = scanner::run_prepared_scan(db, prepared, None)?;
        return emit(&summary, true, print_scan_summary);
    }

    let events = EventHub::default();
    let mut rx = events.subscribe();
    let mut printer = ScanCliProgressPrinter::new();
    let progress = scanner::ScanProgressStore::with_events(events);
    progress.start(&prepared);
    drain_scan_cli_events(&mut rx, &mut printer);
    let scan_db = db.clone();
    let scan_progress = progress.clone();
    let handle = thread::spawn(move || {
        scanner::run_prepared_scan(&scan_db, prepared, Some(scan_progress))
    });

    while !handle.is_finished() {
        drain_scan_cli_events(&mut rx, &mut printer);
        thread::sleep(Duration::from_millis(100));
    }
    drain_scan_cli_events(&mut rx, &mut printer);

    let summary = handle
        .join()
        .map_err(|_| anyhow::anyhow!("scan worker panicked"))??;
    if summary.status == "stopped" {
        progress.stopped(&summary.scan_id);
    } else {
        progress.finish(&summary);
    }
    drain_scan_cli_events(&mut rx, &mut printer);
    printer.finish();
    print_scan_summary(&summary)
}

fn drain_scan_cli_events(
    rx: &mut tokio::sync::broadcast::Receiver<AppEvent>,
    printer: &mut ScanCliProgressPrinter,
) {
    loop {
        match rx.try_recv() {
            Ok(event) => printer.print_event(&event),
            Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
            Err(tokio::sync::broadcast::error::TryRecvError::Closed) => break,
            Err(tokio::sync::broadcast::error::TryRecvError::Lagged(dropped)) => {
                printer.print_line(&format!("progress: skipped {dropped} lagged scan events"));
            }
        }
    }
}

struct ScanCliProgressPrinter {
    interactive: bool,
    rendered_len: usize,
}

impl ScanCliProgressPrinter {
    fn new() -> Self {
        Self {
            interactive: std::io::stdout().is_terminal(),
            rendered_len: 0,
        }
    }

    fn print_event(&mut self, event: &AppEvent) {
        let scan_id = event
            .payload
            .get("scan_id")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown-scan");
        match event.kind.as_str() {
            "scan_log" => {
                if let Some(line) = event.payload.get("line").and_then(|value| value.as_str()) {
                    if should_print_scan_log_line(line) {
                        self.print_line(&format!("scan {scan_id}: {line}"));
                    }
                }
            }
            "scan_progress" | "scan_started" | "scan_failed" => {
                if event.kind == "scan_started" {
                    self.print_scan_started(scan_id, event);
                }
                self.print_progress(scan_id, event);
            }
            _ => {}
        }
    }

    fn print_scan_started(&mut self, scan_id: &str, event: &AppEvent) {
        let Some(lines) = event.payload.get("log").and_then(|value| value.as_array()) else {
            return;
        };
        for line in lines.iter().filter_map(|value| value.as_str()) {
            self.print_line(&format!("scan {scan_id}: {line}"));
        }
    }

    fn print_progress(&mut self, scan_id: &str, event: &AppEvent) {
        let short_id = scan_id.get(..8).unwrap_or(scan_id);
        let file_count = event
            .payload
            .get("file_count")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let dir_count = event
            .payload
            .get("dir_count")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let error_count = event
            .payload
            .get("error_count")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let total_bytes = event
            .payload
            .get("total_bytes")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let status = event
            .payload
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or("running");
        let pools = event.payload.get("pools");
        let discovery = ScanCliPool::from_payload(pools, "discovery");
        let metadata = ScanCliPool::from_payload(pools, "metadata");
        let hashing = ScanCliPool::from_payload(pools, "hashing");
        let elapsed = scan_cli_elapsed(event);
        let line = format!(
            "[{elapsed}] scan {short_id} {status} | files {} dirs {} errors {} size {} | discover {} | metadata {} | hash {}",
            format_count(file_count),
            format_count(dir_count),
            format_count(error_count),
            format_bytes(total_bytes),
            discovery.compact(),
            metadata.compact(),
            hashing.with_bar(16),
        );
        self.render_status(&line);
    }

    fn render_status(&mut self, line: &str) {
        if self.interactive {
            let padding = self.rendered_len.saturating_sub(line.len());
            print!("\r{line}{}", " ".repeat(padding));
            let _ = std::io::stdout().flush();
            self.rendered_len = line.len();
        } else {
            println!("{line}");
        }
    }

    fn print_line(&mut self, line: &str) {
        if self.interactive && self.rendered_len > 0 {
            print!("\r{}\r", " ".repeat(self.rendered_len));
            self.rendered_len = 0;
        }
        println!("{line}");
    }

    fn finish(&mut self) {
        if self.interactive && self.rendered_len > 0 {
            println!();
            self.rendered_len = 0;
        }
    }
}

fn should_print_scan_log_line(line: &str) -> bool {
    !(line.contains(" processed ")
        || line.trim_start().starts_with("processed ")
        || line.contains(" reused metadata ")
        || line.trim_start().starts_with("reused metadata "))
}

#[derive(Clone, Copy, Debug)]
struct ScanCliPool {
    done: u64,
    active: u64,
    queued: u64,
    failed: u64,
}

impl ScanCliPool {
    fn from_payload(pools: Option<&serde_json::Value>, name: &str) -> Self {
        let pool = pools.and_then(|pools| pools.get(name));
        Self {
            done: scan_cli_pool_value(pool, "completed"),
            active: scan_cli_pool_value(pool, "active"),
            queued: scan_cli_pool_value(pool, "queued"),
            failed: scan_cli_pool_value(pool, "failed"),
        }
    }

    fn left(self) -> u64 {
        self.active + self.queued
    }

    fn total(self) -> u64 {
        self.done + self.left() + self.failed
    }

    fn compact(self) -> String {
        let total = self.total();
        if self.failed == 0 {
            format!("{}/{} left {}", format_count(self.done), format_count(total), format_count(self.left()))
        } else {
            format!(
                "{}/{} left {} failed {}",
                format_count(self.done),
                format_count(total),
                format_count(self.left()),
                format_count(self.failed)
            )
        }
    }

    fn with_bar(self, width: usize) -> String {
        let total = self.total();
        let filled = if total == 0 {
            0
        } else {
            ((self.done as f64 / total as f64) * width as f64).round() as usize
        }
        .min(width);
        let bar = format!("{}{}", "#".repeat(filled), "-".repeat(width - filled));
        let mut text = format!(
            "[{bar}] {}/{} left {} active {} queued {}",
            format_count(self.done),
            format_count(total),
            format_count(self.left()),
            format_count(self.active),
            format_count(self.queued)
        );
        if self.failed > 0 {
            text.push_str(&format!(" failed {}", format_count(self.failed)));
        }
        text
    }
}

fn scan_cli_pool_value(pool: Option<&serde_json::Value>, key: &str) -> u64 {
    pool.and_then(|pool| pool.get(key))
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
}

fn scan_cli_elapsed(event: &AppEvent) -> String {
    let Some(started_at) = event
        .payload
        .get("started_at")
        .and_then(|value| value.as_str())
    else {
        return "unknown".to_string();
    };
    let Ok(started_at) = DateTime::parse_from_rfc3339(started_at) else {
        return "unknown".to_string();
    };
    let elapsed = Utc::now()
        .signed_duration_since(started_at.with_timezone(&Utc))
        .to_std()
        .unwrap_or_default();
    format_duration(elapsed)
}

fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.as_secs();
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn format_count(value: u64) -> String {
    if value >= 1_000_000_000 {
        format!("{:.1}b", value as f64 / 1_000_000_000.0)
    } else if value >= 1_000_000 {
        format!("{:.1}m", value as f64 / 1_000_000.0)
    } else if value >= 10_000 {
        format!("{:.1}k", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

fn format_bytes(value: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KiB", "MiB", "GiB", "TiB"];
    let mut amount = value as f64;
    let mut unit = 0;
    while amount >= 1024.0 && unit < UNITS.len() - 1 {
        amount /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{value} {}", UNITS[unit])
    } else if amount >= 10.0 {
        format!("{amount:.1} {}", UNITS[unit])
    } else {
        format!("{amount:.2} {}", UNITS[unit])
    }
}

fn run_server_scan_request(
    server: Option<&str>,
    method: &str,
    params: Option<serde_json::Value>,
    json: bool,
) -> Result<()> {
    let server = server.with_context(|| {
        format!("{method} targets a running app process; pass --server http://127.0.0.1:3838")
    })?;
    let response = post_json_rpc(server, method, params.unwrap_or_else(|| serde_json::json!({})))?;
    let result = response
        .get("result")
        .cloned()
        .or_else(|| response.get("error").map(|error| serde_json::json!({ "error": error })))
        .with_context(|| format!("invalid JSON-RPC response from {server}: {response}"))?;
    if result.get("error").is_some() {
        anyhow::bail!("{}", result["error"]["message"].as_str().unwrap_or("server error"));
    }
    emit(&result, json, |result| print_server_scan_result(method, result))
}

fn post_json_rpc(server: &str, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
    let endpoint = parse_server_endpoint(server)?;
    let body = serde_json::to_string(&serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }))?;
    let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
        .with_context(|| format!("connecting to {server}"))?;
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        endpoint.path,
        endpoint.host_header,
        body.len(),
        body
    );
    stream
        .write_all(request.as_bytes())
        .with_context(|| format!("sending JSON-RPC request to {server}"))?;

    let mut raw = String::new();
    stream
        .read_to_string(&mut raw)
        .with_context(|| format!("reading JSON-RPC response from {server}"))?;
    parse_http_json_response(server, &raw)
}

struct ServerEndpoint {
    host: String,
    host_header: String,
    port: u16,
    path: String,
}

fn parse_server_endpoint(server: &str) -> Result<ServerEndpoint> {
    let server = server.trim().trim_end_matches('/');
    let without_scheme = server
        .strip_prefix("http://")
        .with_context(|| "only http:// server URLs are currently supported")?;
    let (authority, base_path) = without_scheme
        .split_once('/')
        .map(|(authority, path)| (authority, format!("/{path}")))
        .unwrap_or((without_scheme, String::new()));
    let (host, port) = if let Some((host, port)) = authority.rsplit_once(':') {
        (
            host.to_string(),
            port.parse::<u16>()
                .with_context(|| format!("invalid port in server URL: {server}"))?,
        )
    } else {
        (authority.to_string(), 80)
    };
    if host.is_empty() {
        anyhow::bail!("server URL is missing a host");
    }
    let path = format!("{}/api/rpc", base_path.trim_end_matches('/'));
    let host_header = if authority.contains(':') {
        authority.to_string()
    } else {
        format!("{host}:{port}")
    };

    Ok(ServerEndpoint {
        host,
        host_header,
        port,
        path,
    })
}

fn parse_http_json_response(server: &str, raw: &str) -> Result<serde_json::Value> {
    let (headers, body) = raw
        .split_once("\r\n\r\n")
        .with_context(|| format!("invalid HTTP response from {server}"))?;
    let status_line = headers.lines().next().unwrap_or("");
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|status| status.parse::<u16>().ok())
        .with_context(|| format!("invalid HTTP status from {server}: {status_line}"))?;
    if !(200..300).contains(&status) {
        anyhow::bail!("server returned HTTP {status}: {body}");
    }
    Ok(serde_json::from_str(body)?)
}

fn run_scan_excludes(db: Database, command: ScanExcludesCommand, json: bool) -> Result<()> {
    match command.command {
        ScanExcludesSubcommand::Get(args) => {
            let excludes = db.scan_excludes(&args.scan_id)?;
            emit(&excludes, json, |excludes| {
                for exclude in excludes {
                    println!("{}", exclude.pattern);
                }
                Ok(())
            })
        }
        ScanExcludesSubcommand::Set(args) => {
            let excludes = db.set_scan_excludes(&args.scan_id, args.patterns)?;
            emit(&excludes, json, |excludes| {
                for exclude in excludes {
                    println!("{}", exclude.pattern);
                }
                Ok(())
            })
        }
    }
}

fn run_files(db: Database, command: FilesCommand, json: bool) -> Result<()> {
    match command.command {
        FilesSubcommand::Find(args) => {
            let files = db.find_files(&args.query, args.limit)?;
            emit(&files, json, |files| print_files(files))
        }
        FilesSubcommand::Search(args) => {
            let query = file_search_query(args)?;
            let files = db.search_files(&query)?;
            emit(&files, json, |files| print_files(files))
        }
        FilesSubcommand::Details(args) => {
            let details = media::file_details(&db, &args.blake3, args.size)?;
            emit(&details, json, |_| {
                println!("file details are only available as JSON; rerun with --json");
                Ok(())
            })
        }
        FilesSubcommand::Open(args) => {
            let path = app::location_child_path(&db, &args.location_slug, &args.path)?;
            app::open_in_system(&path)?;
            let result = serde_json::json!({
                "opened": true,
                "location_slug": args.location_slug,
                "path": args.path,
                "resolved_path": path,
            });
            emit(&result, json, |result| {
                println!(
                    "opened {}",
                    result["resolved_path"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
        FilesSubcommand::Reveal(args) => {
            let path = app::location_child_path(&db, &args.location_slug, &args.path)?;
            app::reveal_in_system(&path)?;
            let result = serde_json::json!({
                "revealed": true,
                "location_slug": args.location_slug,
                "path": args.path,
                "resolved_path": path,
            });
            emit(&result, json, |result| {
                println!(
                    "revealed {}",
                    result["resolved_path"].as_str().unwrap_or("")
                );
                Ok(())
            })
        }
    }
}

fn run_duplicates(db: Database, command: DuplicatesCommand, json: bool) -> Result<()> {
    match command.command {
        DuplicatesSubcommand::List(args) => {
            let groups = db.duplicate_groups_for_scans(args.limit, &args.scan_ids)?;
            emit(&groups, json, |groups| print_duplicate_groups(groups))
        }
    }
}

fn run_thumbnails(db: Database, command: ThumbnailsCommand, json: bool) -> Result<()> {
    match command.command {
        ThumbnailsSubcommand::Build(args) => {
            let result = if args.paths.is_empty() {
                media::build_thumbnails(&db, &args.scan_id, &args.path, args.recursive)?
            } else {
                media::build_thumbnails_for_paths(
                    &db,
                    &args.scan_id,
                    &args.paths,
                    &args.path,
                    args.recursive,
                )?
            };
            emit(&result, json, |result| {
                println!(
                    "built {} thumbnails, skipped {}, errors {}",
                    result.built,
                    result.skipped,
                    result.errors.len()
                );
                Ok(())
            })
        }
    }
}

fn run_file_extra_info(db: Database, command: FileExtraInfoCommand, json: bool) -> Result<()> {
    match command.command {
        FileExtraInfoSubcommand::Exif(args) => {
            let result = media::build_exif(&db, &args.scan_id, &args.path, args.recursive)?;
            emit(&result, json, |result| {
                println!(
                    "processed {} EXIF candidates, enriched {}, skipped {}, errors {}",
                    result.processed,
                    result.enriched,
                    result.skipped,
                    result.errors.len()
                );
                Ok(())
            })
        }
    }
}

fn file_search_query(args: FileSearchArgs) -> Result<FileSearchQuery> {
    let mut query = match args.filter_json {
        Some(filter_json) => serde_json::from_str::<FileSearchQuery>(&filter_json)
            .context("--filter-json must be a structured FileSearchQuery JSON object")?,
        None => FileSearchQuery::default(),
    };
    let mut filters = Vec::new();

    if let Some(text) = args.text {
        filters.push(search_predicate(
            FileSearchTerm::Text,
            FileSearchOperator::Substring,
            text,
        ));
    }
    if let Some(extension) = args.extension {
        filters.push(search_predicate(
            FileSearchTerm::Extension,
            FileSearchOperator::Equal,
            extension,
        ));
    }
    if let Some(location_slug) = args.location_slug {
        filters.push(search_predicate(
            FileSearchTerm::LocationSlug,
            FileSearchOperator::Equal,
            location_slug,
        ));
    }
    if let Some(kind) = args.kind {
        let value: &'static str = kind.into();
        filters.push(search_predicate(
            FileSearchTerm::Kind,
            FileSearchOperator::Equal,
            value.to_string(),
        ));
    }
    if let Some(mtime_after) = args.mtime_after {
        filters.push(search_predicate(
            FileSearchTerm::Mtime,
            FileSearchOperator::After,
            mtime_after,
        ));
    }
    if let Some(mtime_before) = args.mtime_before {
        filters.push(search_predicate(
            FileSearchTerm::Mtime,
            FileSearchOperator::Before,
            mtime_before,
        ));
    }
    if !filters.is_empty() {
        query.filter = Some(match query.filter.take() {
            Some(existing) => and_filter([vec![existing], filters].concat()),
            None => and_filter(filters),
        });
    }
    if args.limit.is_some() {
        query.limit = args.limit;
    }
    if args.offset.is_some() {
        query.offset = args.offset;
    }

    Ok(query)
}

fn search_predicate(
    term: FileSearchTerm,
    operator: FileSearchOperator,
    expression: String,
) -> FileSearchFilter {
    FileSearchFilter {
        term,
        operator,
        expression: FileSearchExpression::String(expression),
    }
}

fn and_filter(expression: Vec<FileSearchFilter>) -> FileSearchFilter {
    FileSearchFilter {
        term: FileSearchTerm::Filter,
        operator: FileSearchOperator::And,
        expression: FileSearchExpression::Filters(expression),
    }
}

fn emit<T, F>(value: &T, json: bool, print_human: F) -> Result<()>
where
    T: Serialize,
    F: FnOnce(&T) -> Result<()>,
{
    if json {
        println!("{}", serde_json::to_string_pretty(value)?);
        Ok(())
    } else {
        print_human(value)
    }
}

fn print_overview(overview: &file_census_backend::db::Overview) -> Result<()> {
    println!(
        "{} locations, {} scans, {} files, {} bytes, {} duplicate groups",
        overview.location_count,
        overview.scan_count,
        overview.file_count,
        overview.total_bytes,
        overview.duplicate_groups
    );
    Ok(())
}

fn print_scans(scans: &[file_census_backend::db::Scan]) -> Result<()> {
    for scan in scans {
        println!(
            "{}\t{}\t{}\t{}\t{} files\t{}",
            scan.id,
            scan.nickname,
            scan.location_slug,
            scan.status,
            scan.file_count,
            scan.started_at
        );
    }
    Ok(())
}

fn print_scan_summary(summary: &scanner::ScanSummary) -> Result<()> {
    println!(
        "scan {} {}: {} files, {} dirs, {} errors, {} bytes",
        summary.scan_id,
        summary.status,
        summary.file_count,
        summary.dir_count,
        summary.error_count,
        summary.total_bytes
    );
    Ok(())
}

fn print_discovery_stats(stats: &scanner::DiscoveryStats) -> Result<()> {
    println!(
        "discovered {} entries: {} files, {} dirs, {} errors, {} bytes in {} ms using {} threads ({:.1} entries/s)",
        stats.entries,
        stats.files,
        stats.dirs,
        stats.errors,
        stats.bytes,
        stats.elapsed_ms,
        stats.threads,
        stats.entries_per_second
    );
    Ok(())
}

fn print_files(files: &[file_census_backend::db::FileRow]) -> Result<()> {
    for file in files {
        println!(
            "{}\t{}\t{}\t{}",
            file.location_slug, file.scan_id, file.size, file.path
        );
    }
    Ok(())
}

fn print_location_liveness(locations: &[app::LocationView]) -> Result<()> {
    for location in locations {
        println!(
            "{}\t{}\t{}",
            location.location.slug,
            if location.connected {
                "connected"
            } else {
                "disconnected"
            },
            location
                .liveness_error
                .as_deref()
                .unwrap_or_else(|| location.location.root_path.to_str().unwrap_or(""))
        );
    }
    Ok(())
}

fn print_server_scan_result(method: &str, result: &serde_json::Value) -> Result<()> {
    match method {
        "scans.running" => {
            let running = result.as_array().map(Vec::as_slice).unwrap_or(&[]);
            if running.is_empty() {
                println!("no running scans");
                return Ok(());
            }
            for scan in running {
                println!(
                    "{}\t{}\t{} files\t{}",
                    scan["scan_id"].as_str().unwrap_or(""),
                    scan["status"].as_str().unwrap_or("unknown"),
                    scan["file_count"].as_u64().unwrap_or(0),
                    scan["current_path"].as_str().unwrap_or("")
                );
            }
        }
        "scans.progress" => {
            if result.is_null() {
                println!("scan progress not found");
            } else {
                println!(
                    "{}\t{}\t{} files\t{}",
                    result["scan_id"].as_str().unwrap_or(""),
                    result["status"].as_str().unwrap_or("unknown"),
                    result["file_count"].as_u64().unwrap_or(0),
                    result["current_path"].as_str().unwrap_or("")
                );
            }
        }
        method if method.starts_with("scans.") => {
            let action = method.trim_start_matches("scans.");
            let key = format!("{action}_requested");
            println!(
                "{} {}: {}",
                action,
                result["scan_id"].as_str().unwrap_or(""),
                result.get(&key).and_then(|value| value.as_bool()).unwrap_or(false)
            );
        }
        _ => println!("{result}"),
    }
    Ok(())
}

fn print_duplicate_groups(groups: &[file_census_backend::db::DuplicateGroup]) -> Result<()> {
    for group in groups {
        println!(
            "{} bytes\t{}\t{}\t{} copies",
            group.size, group.file_kind, group.blake3, group.count
        );
        for file in &group.files {
            println!("  {}\t{}\t{}", file.location_slug, file.scan_id, file.path);
        }
    }
    Ok(())
}
