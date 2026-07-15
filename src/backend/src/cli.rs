use std::io::{IsTerminal, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{ArgAction, Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::Value;

use file_census_backend::app;
use file_census_backend::db::{Database, LocationInput, LocationType, LocationUpdate};
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
    /// Scan LOCATION_SLUG, or with global --db bootstrap SOURCE_PATH VOLUME_SLUG.
    /// Bootstrap scan IDs use UTC YYYYMMDDTHHMMSSZ--<slug>; collisions append --2, --3, and so on.
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
    /// Run optional file enrichment processors (currently unavailable).
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
    /// Add a location rooted at a path.
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

impl AddLocationArgs {
    fn into_location_input(self) -> LocationInput {
        let Self {
            kind,
            name,
            slug,
            path,
            notes,
        } = self;
        LocationInput {
            kind: kind.unwrap_or(LocationKind::Unknown).into(),
            name: name.unwrap_or_else(|| slug.clone()),
            slug,
            root_path: path,
            notes,
        }
    }
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
    /// Unavailable: discovery benchmark support is not implemented in this build.
    BenchmarkDiscovery(DiscoveryBenchmarkArgs),
    /// List scans currently running in a targeted server process.
    Running,
    /// Scan a registered location into a new snapshot and wait for completion.
    Start(ScanStartArgs),
    /// Update a scan by re-reading missing or incomplete information.
    Update(ScanIdArgs),
    /// Unavailable: scanner repair support is not implemented in this build.
    Repair(ScanIdArgs),
    /// Unavailable: active scans cannot be paused in this build.
    Pause(ScanIdArgs),
    /// Unavailable: active scans cannot be resumed in this build.
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
    /// Unavailable: scans do not have mutable nicknames in this build.
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
    /// Registered location slug (legacy), or a source directory when VOLUME_SLUG is supplied.
    #[arg(value_name = "LOCATION_OR_SOURCE")]
    location_or_source: String,
    /// Compatible bootstrap shorthand: create or verify this location slug for SOURCE_PATH.
    #[arg(value_name = "VOLUME_SLUG")]
    volume_slug: Option<String>,
    /// Optional subpath under the location/source root.
    #[arg(long, default_value = "/")]
    offset: PathBuf,
}

#[derive(Args)]
struct ScanStartArgs {
    /// Registered location slug to scan.
    slug: String,
    /// Optional subpath under the location root.
    #[arg(long, default_value = "/")]
    offset: PathBuf,
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
    /// Folder traversal depth. Must be at least 1; output is always bounded.
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
    /// List visible occurrences for a file in pages.
    Occurrences(FileOccurrencesArgs),
    /// Open an indexed file or folder in the system file browser.
    Open(FilePathActionArgs),
    /// Reveal an indexed file or folder in the system file browser.
    Reveal(FilePathActionArgs),
}

#[derive(Args)]
struct FileDetailsArgs {
    /// Scan containing the visible file origin.
    scan_id: String,
    /// Indexed relative path of the visible file origin.
    path: String,
    #[arg(long)]
    blake3: String,
    #[arg(long)]
    size: u64,
    /// Maximum visible occurrences included in the first page.
    #[arg(long, default_value_t = 100)]
    limit: u32,
}

#[derive(Args)]
struct FileOccurrencesArgs {
    /// Scan containing the visible file origin.
    scan_id: String,
    /// Indexed relative path of the visible file origin.
    path: String,
    #[arg(long)]
    blake3: String,
    #[arg(long)]
    size: u64,
    /// Maximum visible occurrences to return.
    #[arg(long, default_value_t = 100)]
    limit: u32,
    /// Number of visible occurrences to skip.
    #[arg(long, default_value_t = 0)]
    offset: u64,
}

#[derive(Args)]
struct FilePathActionArgs {
    /// Scan ID. A legacy location slug is accepted only when it has exactly one scan.
    scan_id: String,
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
    /// Unavailable: EXIF enrichment is not implemented in this build.
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
            let prepared = prepare_compatible_scan(&db, args)?;
            run_prepared_scan_cli(&db, prepared, cli.json)?;
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
            run_file_extra_info(command)?;
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

/// Preserves `scan <LOCATION_SLUG>` while supporting the documented bootstrap
/// form: `scan <SOURCE_PATH> <VOLUME_SLUG>`.
fn prepare_compatible_scan(db: &Database, args: ScanArgs) -> Result<scanner::PreparedScan> {
    prepare_compatible_scan_with_started_at(db, args, Utc::now())
}

fn prepare_compatible_scan_with_started_at(
    db: &Database,
    args: ScanArgs,
    started_at: DateTime<Utc>,
) -> Result<scanner::PreparedScan> {
    let ScanArgs {
        location_or_source,
        volume_slug,
        offset,
    } = args;
    match volume_slug {
        Some(volume_slug) => scanner::prepare_bootstrap_scan_with_started_at(
            db,
            Path::new(&location_or_source),
            &volume_slug,
            &offset,
            started_at,
        ),
        None => scanner::prepare_scan(db, &location_or_source, &offset),
    }
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
            FilesSubcommand::Occurrences(_) => "files.occurrences",
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
            let location = db.add_location(args.into_location_input())?;
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
            let locations = serde_json::to_value(app::locations_with_liveness(&db)?)?;
            let result = match args.slug {
                Some(slug) => locations
                    .as_array()
                    .and_then(|items| {
                        items
                            .iter()
                            .find(|item| {
                                item.get("slug").and_then(Value::as_str) == Some(slug.as_str())
                            })
                    })
                    .cloned()
                    .with_context(|| format!("location not found: {slug}"))?,
                None => locations,
            };
            emit(&result, json, print_location_liveness)
        }
        LocationSubcommand::OpenFolder(args) => {
            let path = location_child_path(&db, &args.slug, &args.path)?;
            open_in_system(&path)?;
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
        ScanSubcommand::BenchmarkDiscovery(_) => unavailable_command("scans benchmark-discovery"),
        ScanSubcommand::Running => run_server_scan_request(server, "scans.running", None, json),
        ScanSubcommand::Progress(args) => run_server_scan_request(
            server,
            "scans.progress",
            Some(serde_json::json!({ "scan_id": args.scan_id })),
            json,
        ),
        ScanSubcommand::Pause(_) => unavailable_command("scans pause"),
        ScanSubcommand::Resume(_) => unavailable_command("scans resume"),
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
            let prepared = scanner::prepare_scan(&db, &args.slug, &args.offset)?;
            run_prepared_scan_cli(&db, prepared, json)
        }
        ScanSubcommand::Update(args) => {
            let db = Database::open(db_path)?;
            let prepared = scanner::prepare_update_scan(&db, &args.scan_id)?;
            run_prepared_scan_cli(&db, prepared, json)
        }
        ScanSubcommand::Repair(_) => unavailable_command("scans repair"),
        ScanSubcommand::Tree(args) => {
            let db = Database::open(db_path)?;
            if args.depth == 0 {
                anyhow::bail!(
                    "--depth must be at least 1; unbounded recursive tree output is not supported"
                );
            }
            let path = normalized_tree_path(&args.path)?;
            let tree = db.scan_tree_page(
                &args.scan_id,
                &path,
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
        ScanSubcommand::Nickname(_) => unavailable_command("scans nickname"),
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
            let path = normalized_scan_path(&args.path)?;
            let deleted = db.delete_visible_scan_path(&args.scan_id, &path)?;
            let result = serde_json::json!({
                "scan_id": args.scan_id,
                "path": path,
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

fn unavailable_command(command: &str) -> Result<()> {
    anyhow::bail!(
        "{command} is unavailable in this build because the recovered backend does not implement it"
    )
}

fn run_prepared_scan_cli(
    db: &Database,
    prepared: scanner::PreparedScan,
    json: bool,
) -> Result<()> {
    if json {
        let summary = scanner::run_prepared_scan(db, prepared, None)?;
        println!("{}", serde_json::to_string_pretty(&scan_summary_json(&summary))?);
        return Ok(());
    }

    let events = EventHub::default();
    let mut rx = events.subscribe();
    let mut printer = ScanCliProgressPrinter::new();
    let progress = scanner::ScanProgressStore::with_events(events);
    progress.start(&prepared);
    drain_scan_cli_events(&mut rx, &mut printer);
    let scan_id = prepared.scan_id.clone();
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

    let worker_result = match handle.join() {
        Ok(result) => result,
        Err(_) => {
            let error = anyhow::anyhow!("scan worker panicked");
            progress.fail(&scan_id, error.to_string());
            drain_scan_cli_events(&mut rx, &mut printer);
            printer.finish();
            return Err(error);
        }
    };
    let summary = match worker_result {
        Ok(summary) => summary,
        Err(error) => {
            progress.fail(&scan_id, error.to_string());
            drain_scan_cli_events(&mut rx, &mut printer);
            printer.finish();
            return Err(error);
        }
    };
    if summary.status == "stopped" {
        progress.stopped(&summary.scan_id);
    } else {
        progress.finish(&summary);
    }
    drain_scan_cli_events(&mut rx, &mut printer);
    printer.finish();
    print_scan_summary(&summary)
}

fn scan_summary_json(summary: &scanner::ScanSummary) -> Value {
    serde_json::json!({
        "scan_id": summary.scan_id.as_str(),
        "status": summary.status.as_str(),
        "file_count": summary.file_count,
        "dir_count": summary.dir_count,
        "error_count": summary.error_count,
        "total_bytes": summary.total_bytes,
    })
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
    let result = match method {
        "scans.running" => request_server_json(server, "GET", "/api/scans/running")?,
        "scans.progress" => {
            let scan_id = server_scan_id(params.as_ref())?;
            let path = format!("/api/scans/{}/progress", encode_path_segment(scan_id));
            request_server_json(server, "GET", &path)?
        }
        "scans.stop" => {
            let scan_id = server_scan_id(params.as_ref())?;
            let path = format!("/api/scans/{}/stop", encode_path_segment(scan_id));
            request_server_json(server, "POST", &path)?
        }
        _ => anyhow::bail!("{method} is not supported by the running server API"),
    };
    emit(&result, json, |result| print_server_scan_result(method, result))
}

fn server_scan_id(params: Option<&Value>) -> Result<&str> {
    params
        .and_then(|params| params.get("scan_id"))
        .and_then(Value::as_str)
        .context("running server scan request is missing scan_id")
}

fn encode_path_segment(segment: &str) -> String {
    let mut encoded = String::new();
    for byte in segment.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push_str(&format!("{byte:02X}"));
        }
    }
    encoded
}

/// The live HTTP server exposes these scan controls as REST routes. JSON-RPC
/// currently lives only on the event WebSocket, so CLI process control uses
/// the directly reachable HTTP surface instead of posting to a nonexistent
/// `/api/rpc` endpoint.
fn request_server_json(
    server: &str,
    http_method: &str,
    route: &str,
) -> Result<serde_json::Value> {
    let endpoint = parse_server_endpoint(server, route)?;
    let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
        .with_context(|| format!("connecting to {server}"))?;
    let request = format!(
        "{http_method} {} HTTP/1.1\r\nHost: {}\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
        endpoint.path,
        endpoint.host_header
    );
    stream
        .write_all(request.as_bytes())
        .with_context(|| format!("sending {http_method} request to {server}"))?;

    let mut raw = String::new();
    stream
        .read_to_string(&mut raw)
        .with_context(|| format!("reading response from {server}"))?;
    parse_http_json_response(server, &raw)
}

struct ServerEndpoint {
    host: String,
    host_header: String,
    port: u16,
    path: String,
}

fn parse_server_endpoint(server: &str, route: &str) -> Result<ServerEndpoint> {
    if !route.starts_with('/') {
        anyhow::bail!("server route must start with a slash")
    }
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
    let path = format!("{}{}", base_path.trim_end_matches('/'), route);
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
            let path = normalized_scan_path(&args.path)?;
            let page = db.visible_file_occurrences_page(
                &args.scan_id,
                &path,
                &args.blake3,
                args.size,
                args.limit.max(1),
                0,
            )?;
            let details = file_details_page(&db, page)?;
            emit(&details, json, print_file_details)
        }
        FilesSubcommand::Occurrences(args) => {
            let path = normalized_scan_path(&args.path)?;
            let page = db.visible_file_occurrences_page(
                &args.scan_id,
                &path,
                &args.blake3,
                args.size,
                args.limit.max(1),
                args.offset,
            )?;
            emit(&page, json, |page| {
                for occurrence in &page.occurrences {
                    println!("{}\t{}\t{}", occurrence.scan_id, occurrence.size, occurrence.path);
                }
                if page.has_more {
                    eprintln!(
                        "showing {} of {} occurrences; next offset: {}",
                        page.occurrences.len(),
                        page.total,
                        page.next_offset.unwrap_or(page.offset)
                    );
                }
                Ok(())
            })
        }
        FilesSubcommand::Open(args) => {
            let scan_id = resolve_action_scan_id(&db, &args.scan_id)?;
            let path = scan_child_path(&db, &scan_id, &args.path)?;
            open_in_system(&path)?;
            let result = serde_json::json!({
                "opened": true,
                "scan_id": scan_id,
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
            let scan_id = resolve_action_scan_id(&db, &args.scan_id)?;
            let path = scan_child_path(&db, &scan_id, &args.path)?;
            reveal_in_system(&path)?;
            let result = serde_json::json!({
                "revealed": true,
                "scan_id": scan_id,
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

fn location_child_path(db: &Database, slug: &str, relative_path: &str) -> Result<PathBuf> {
    let relative_path = action_relative_path(relative_path)?;
    location_child_path_from_relative(db, slug, &relative_path)
}

fn location_child_path_from_relative(
    db: &Database,
    slug: &str,
    relative_path: &Path,
) -> Result<PathBuf> {
    let location = db
        .location_by_slug(slug)?
        .with_context(|| format!("location not found: {slug}"))?;
    Ok(location.root_path.join(relative_path))
}

fn scan_child_path(db: &Database, scan_id: &str, relative_path: &str) -> Result<PathBuf> {
    Ok(db
        .resolve_visible_scan_action_target(scan_id, relative_path)?
        .filesystem_path)
}

fn resolve_action_scan_id(db: &Database, scan_id: &str) -> Result<String> {
    if db.scan_by_id(scan_id)?.is_some() {
        return Ok(scan_id.to_string());
    }

    let scan_ids = db.scan_ids_for_location(scan_id)?;
    match scan_ids.as_slice() {
        [scan_id] => Ok(scan_id.clone()),
        [] => anyhow::bail!("scan not found: {scan_id}; files open/reveal require a scan id"),
        _ => anyhow::bail!(
            "location {scan_id} has multiple scans; files open/reveal require a scan id"
        ),
    }
}

fn file_details_page(
    db: &Database,
    page: file_census_backend::db::FileOccurrencePage,
) -> Result<Value> {
    let details = media::file_details_from_visible_occurrences(db, &page.occurrences)?;
    let mut response = serde_json::to_value(details)?;
    let object = response
        .as_object_mut()
        .context("serializing file details response")?;
    object.insert("occurrence_count".to_string(), Value::from(page.total));
    object.insert("occurrence_limit".to_string(), Value::from(page.limit));
    object.insert("occurrence_offset".to_string(), Value::from(page.offset));
    object.insert(
        "occurrences_truncated".to_string(),
        Value::from(page.has_more),
    );
    object.insert(
        "occurrence_next_offset".to_string(),
        serde_json::to_value(page.next_offset)?,
    );
    Ok(response)
}

fn normalized_scan_path(path: &str) -> Result<String> {
    let path = normalized_relative_scan_path(path, "scan path")?;
    if path.is_empty() {
        anyhow::bail!("path must not be the scan root")
    }
    Ok(path)
}

fn normalized_tree_path(path: &str) -> Result<String> {
    normalized_relative_scan_path(path, "tree path")
}

fn action_relative_path(path: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(normalized_relative_scan_path(path, "path")?))
}

fn normalized_relative_scan_path(path: &str, label: &str) -> Result<String> {
    let mut prefix = path.chars();
    if prefix.next().is_some_and(is_path_separator) && prefix.next().is_some_and(is_path_separator)
    {
        anyhow::bail!("{label} may not contain a UNC or device prefix")
    }

    let mut normalized = Vec::new();
    for part in path.split(is_path_separator) {
        match part {
            "" | "." => {}
            ".." => anyhow::bail!("{label} may not contain traversal"),
            _ if looks_like_windows_drive_prefix(part) => {
                anyhow::bail!("{label} may not contain a Windows drive prefix")
            }
            _ if part.contains('\0') => anyhow::bail!("{label} may not contain NUL"),
            _ => normalized.push(part),
        }
    }
    Ok(normalized.join("/"))
}

fn is_path_separator(character: char) -> bool {
    character == '/' || character == '\\'
}

fn looks_like_windows_drive_prefix(part: &str) -> bool {
    let bytes = part.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn open_in_system(path: &Path) -> Result<()> {
    open::that(path).with_context(|| format!("opening {}", path.display()))
}

fn reveal_in_system(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .status()
            .with_context(|| format!("revealing {}", path.display()))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status()
            .with_context(|| format!("revealing {}", path.display()))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let folder = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        open::that(folder).with_context(|| format!("revealing {}", path.display()))
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

fn run_file_extra_info(command: FileExtraInfoCommand) -> Result<()> {
    match command.command {
        FileExtraInfoSubcommand::Exif(_) => unavailable_command("file-extra-info exif"),
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
            scan.location_slug,
            scan.offset_path,
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

fn print_files(files: &[file_census_backend::db::FileRow]) -> Result<()> {
    for file in files {
        println!(
            "{}\t{}\t{}\t{}",
            file.location_slug, file.scan_id, file.size, file.path
        );
    }
    Ok(())
}

fn print_file_details(details: &Value) -> Result<()> {
    let occurrences = details
        .get("occurrences")
        .and_then(Value::as_array)
        .context("file details response is missing occurrences")?;
    for occurrence in occurrences {
        println!(
            "{}\t{}\t{}",
            occurrence["scan_id"].as_str().unwrap_or(""),
            occurrence["size"].as_u64().unwrap_or(0),
            occurrence["path"].as_str().unwrap_or("")
        );
    }
    if details
        .get("occurrences_truncated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        eprintln!(
            "showing {} of {} occurrences; next offset: {}",
            occurrences.len(),
            details
                .get("occurrence_count")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            details
                .get("occurrence_next_offset")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        );
    }
    Ok(())
}

fn print_location_liveness(value: &Value) -> Result<()> {
    match value {
        Value::Array(locations) => {
            for location in locations {
                print_location_liveness_entry(location)?;
            }
        }
        Value::Object(_) => print_location_liveness_entry(value)?,
        _ => anyhow::bail!("invalid location liveness response"),
    }
    Ok(())
}

fn print_location_liveness_entry(location: &Value) -> Result<()> {
    let slug = location
        .get("slug")
        .and_then(Value::as_str)
        .context("location liveness response is missing slug")?;
    let connected = location
        .get("connected")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let detail = location
        .get("liveness_error")
        .and_then(Value::as_str)
        .or_else(|| location.get("root_path").and_then(Value::as_str))
        .unwrap_or("");
    println!(
        "{}\t{}\t{}",
        slug,
        if connected { "connected" } else { "disconnected" },
        detail
    );
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
        "scans.stop" => println!(
            "stop requested: {}",
            result["stop_requested"].as_bool().unwrap_or(false)
        ),
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

#[cfg(test)]
mod tests {
    use clap::Parser;
    use file_census_backend::db::NewFile;

    use super::*;

    #[test]
    fn locations_add_defaults_kind_to_unknown_and_name_to_slug() {
        let cli = Cli::try_parse_from([
            "file-census",
            "locations",
            "add",
            "--slug",
            "camera-roll",
            "--path",
            "/tmp/camera-roll",
        ])
        .unwrap();
        let Some(Command::Locations(LocationCommand {
            command: LocationSubcommand::Add(args),
        })) = cli.command
        else {
            panic!("expected locations add command");
        };

        let input = args.into_location_input();
        assert_eq!(input.kind, LocationType::Unknown);
        assert_eq!(input.name, "camera-roll");
        assert_eq!(input.slug, "camera-roll");
    }

    #[test]
    fn locations_add_accepts_explicit_unknown_kind() {
        let cli = Cli::try_parse_from([
            "file-census",
            "locations",
            "add",
            "unknown",
            "--slug",
            "camera-roll",
            "--path",
            "/tmp/camera-roll",
        ])
        .unwrap();
        let Some(Command::Locations(LocationCommand {
            command: LocationSubcommand::Add(args),
        })) = cli.command
        else {
            panic!("expected locations add command");
        };

        assert_eq!(args.into_location_input().kind, LocationType::Unknown);
    }

    #[test]
    fn scan_bootstrap_shorthand_is_deterministic_and_legacy_scan_stays_supported() {
        let root = std::env::temp_dir().join(format!(
            "file-census-cli-bootstrap-scan-{}",
            uuid::Uuid::new_v4()
        ));
        let source_root = root.join("source");
        let legacy_root = root.join("legacy");
        std::fs::create_dir_all(&source_root).unwrap();
        std::fs::create_dir_all(&legacy_root).unwrap();
        let db_path = root.join("state.db");
        let db = Database::open(&db_path).unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let cli = Cli::try_parse_from([
            "file-census",
            "--db",
            db_path.to_str().unwrap(),
            "scan",
            source_root.to_str().unwrap(),
            "archive-volume",
        ])
        .unwrap();
        assert_eq!(cli.db.as_deref(), Some(db_path.as_path()));
        let Some(Command::Scan(args)) = cli.command else {
            panic!("expected scan command");
        };
        let bootstrap = prepare_compatible_scan_with_started_at(&db, args, started_at).unwrap();
        assert_eq!(bootstrap.scan_id, "20260715T123456Z--archive-volume");
        assert_eq!(bootstrap.location.slug, "archive-volume");

        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Legacy".to_string(),
            slug: "legacy".to_string(),
            root_path: legacy_root,
            notes: None,
        })
        .unwrap();
        let legacy = prepare_compatible_scan_with_started_at(
            &db,
            ScanArgs {
                location_or_source: "legacy".to_string(),
                volume_slug: None,
                offset: PathBuf::from("/"),
            },
            DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .unwrap();
        assert_eq!(legacy.location.slug, "legacy");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn resolve_action_scan_id_preserves_legacy_location_slug_ambiguity() {
        let root = std::env::temp_dir().join(format!(
            "file-census-cli-action-scan-id-{}",
            uuid::Uuid::new_v4()
        ));
        let db = Database::open(root.join("state.db")).unwrap();
        let single_location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Single".to_string(),
                slug: "single".to_string(),
                root_path: root.join("single"),
                notes: None,
            })
            .unwrap();
        let scan_id = db
            .start_scan(&single_location, std::path::Path::new("/"))
            .unwrap();
        let entry = |path: &str| NewFile {
            scan_id: scan_id.clone(),
            kind: "file".to_string(),
            path: path.to_string(),
            name: path.to_string(),
            size: 0,
            blake3: String::new(),
            sha256: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        db.insert_file_batch(&[entry("visible.txt"), entry("hidden.txt")])
            .unwrap();
        db.set_scan_excludes(&scan_id, vec!["/hidden.txt".to_string()])
            .unwrap();

        assert_eq!(resolve_action_scan_id(&db, &scan_id).unwrap(), scan_id);
        assert_eq!(resolve_action_scan_id(&db, "single").unwrap(), scan_id);
        assert_eq!(
            scan_child_path(&db, &scan_id, "visible.txt").unwrap(),
            root.join("single/visible.txt")
        );
        assert!(scan_child_path(&db, &scan_id, "hidden.txt").is_err());

        let multiple_location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Multiple".to_string(),
                slug: "multiple".to_string(),
                root_path: root.join("multiple"),
                notes: None,
            })
            .unwrap();
        db.start_scan(&multiple_location, std::path::Path::new("/"))
            .unwrap();
        db.start_scan(&multiple_location, std::path::Path::new("/other"))
            .unwrap();

        let error = resolve_action_scan_id(&db, "multiple").unwrap_err();
        assert!(error.to_string().contains("multiple scans"));

        let _ = std::fs::remove_dir_all(root);
    }
}
