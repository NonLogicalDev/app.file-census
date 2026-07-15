use std::collections::BTreeMap;
use std::io::{BufReader, Cursor};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use base64::Engine;
use image::{GenericImageView, ImageFormat, ImageReader};
use serde::Serialize;

use crate::db::{Database, FileOccurrence, NewThumbnail, StoredThumbnail, ThumbnailCandidate};

const THUMBNAIL_MAX_EDGE: u32 = 512;

#[derive(Clone, Debug, Serialize)]
pub struct FileDetails {
    pub occurrences: Vec<FileOccurrence>,
    pub thumbnail: Option<ThumbnailView>,
    pub exif: ExifView,
}

#[derive(Clone, Debug, Serialize)]
pub struct ThumbnailView {
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub data_url: String,
    pub created_at: Option<String>,
    pub cached: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExifView {
    pub status: String,
    pub source_path: Option<String>,
    pub fields: Vec<ExifField>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExifField {
    pub group: String,
    pub tag: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct BuildThumbnailsResult {
    pub scan_id: String,
    pub path: String,
    pub recursive: bool,
    pub considered: u64,
    pub built: u64,
    pub skipped: u64,
    pub errors: Vec<String>,
}

pub fn file_details(db: &Database, blake3: &str, size: u64) -> Result<FileDetails> {
    let occurrences = db.file_occurrences(blake3, size)?;
    let source = first_available_occurrence_path(db, &occurrences)?;
    let thumbnail = match db.thumbnail(blake3, size)? {
        Some(thumbnail) => Some(thumbnail_view(thumbnail, true)),
        None => source
            .as_ref()
            .and_then(|source| build_thumbnail_for_hash(db, blake3, size, &source.path).ok()),
    };
    let exif = source
        .as_ref()
        .map(|source| exif_for_path(&source.path))
        .unwrap_or_else(|| ExifView {
            status: "unavailable".to_string(),
            source_path: None,
            fields: Vec::new(),
            error: Some("No connected occurrence is available for metadata parsing.".to_string()),
        });

    Ok(FileDetails {
        occurrences,
        thumbnail,
        exif,
    })
}

/// Builds details from occurrences that the caller has already authorized as
/// visible. This intentionally does not expand the supplied list through a
/// global occurrence query or return a hash-keyed cached thumbnail. Any
/// returned thumbnail is freshly generated from a connected visible source.
pub fn file_details_from_visible_occurrences(
    db: &Database,
    occurrences: &[FileOccurrence],
) -> Result<FileDetails> {
    let source = first_available_occurrence_path(db, occurrences)?;
    let thumbnail = source
        .as_ref()
        .and_then(|source| build_thumbnail_for_visible_source(db, source).ok());
    let exif = source
        .as_ref()
        .map(|source| exif_for_path(&source.path))
        .unwrap_or_else(|| ExifView {
            status: "unavailable".to_string(),
            source_path: None,
            fields: Vec::new(),
            error: Some("No connected occurrence is available for metadata parsing.".to_string()),
        });

    Ok(FileDetails {
        occurrences: occurrences.to_vec(),
        thumbnail,
        exif,
    })
}

pub fn build_thumbnails(
    db: &Database,
    scan_id: &str,
    prefix: &str,
    recursive: bool,
) -> Result<BuildThumbnailsResult> {
    let scan_root = scan_root_path(db, scan_id)?;
    let candidates = db.thumbnail_candidates(scan_id, prefix, recursive)?;
    build_thumbnails_for_candidates(
        db,
        scan_id,
        &scan_root,
        prefix,
        recursive,
        candidates,
    )
}

pub fn build_thumbnails_for_paths(
    db: &Database,
    scan_id: &str,
    paths: &[String],
    path: &str,
    recursive: bool,
) -> Result<BuildThumbnailsResult> {
    let scan_root = scan_root_path(db, scan_id)?;
    let candidates = db.thumbnail_candidates_paths(scan_id, paths, recursive)?;
    build_thumbnails_for_candidates(
        db,
        scan_id,
        &scan_root,
        path,
        recursive,
        candidates,
    )
}

fn build_thumbnails_for_candidates(
    db: &Database,
    scan_id: &str,
    scan_root: &Path,
    path: &str,
    recursive: bool,
    candidates: Vec<ThumbnailCandidate>,
) -> Result<BuildThumbnailsResult> {
    let mut result = BuildThumbnailsResult {
        scan_id: scan_id.to_string(),
        path: path.to_string(),
        recursive,
        considered: candidates.len() as u64,
        built: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    for candidate in candidates {
        let candidate_path = indexed_entry_path(scan_root, &candidate.path)?;
        match build_thumbnail_for_candidate(db, &candidate, &candidate_path) {
            Ok(Some(_)) => result.built += 1,
            Ok(None) => result.skipped += 1,
            Err(error) => {
                result.skipped += 1;
                if result.errors.len() < 20 {
                    result.errors.push(format!("{}: {error}", candidate.path));
                }
            }
        }
    }
    Ok(result)
}

fn build_thumbnail_for_hash(
    db: &Database,
    blake3: &str,
    size: u64,
    path: &Path,
) -> Result<ThumbnailView> {
    let candidate = ThumbnailCandidate {
        blake3: blake3.to_string(),
        size,
        path: path.display().to_string(),
    };
    build_thumbnail_for_candidate(db, &candidate, path)?.context("thumbnail could not be built")
}

fn build_thumbnail_for_visible_source(
    db: &Database,
    source: &SourcePath,
) -> Result<ThumbnailView> {
    let thumbnail = generate_thumbnail(&source.path)?
        .context("thumbnail could not be built")?;
    let view = generated_thumbnail_view(&thumbnail);
    db.upsert_thumbnail(NewThumbnail {
        blake3: source.blake3.clone(),
        size: source.size,
        mime_type: "image/jpeg".to_string(),
        width: thumbnail.width,
        height: thumbnail.height,
        data: thumbnail.data,
    })?;
    Ok(view)
}

fn build_thumbnail_for_candidate(
    db: &Database,
    candidate: &ThumbnailCandidate,
    path: &Path,
) -> Result<Option<ThumbnailView>> {
    let Some(thumbnail) = generate_thumbnail(path)? else {
        return Ok(None);
    };
    db.upsert_thumbnail(NewThumbnail {
        blake3: candidate.blake3.clone(),
        size: candidate.size,
        mime_type: "image/jpeg".to_string(),
        width: thumbnail.width,
        height: thumbnail.height,
        data: thumbnail.data,
    })?;
    Ok(db
        .thumbnail(&candidate.blake3, candidate.size)?
        .map(|thumbnail| thumbnail_view(thumbnail, false)))
}

struct GeneratedThumbnail {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

fn generate_thumbnail(path: &Path) -> Result<Option<GeneratedThumbnail>> {
    if !is_probably_image(path) {
        return Ok(None);
    }
    let image = ImageReader::open(path)
        .with_context(|| format!("opening image {}", path.display()))?
        .with_guessed_format()
        .with_context(|| format!("guessing image format {}", path.display()))?
        .decode()
        .with_context(|| format!("decoding image {}", path.display()))?;
    let thumb = image.thumbnail(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE);
    let (width, height) = thumb.dimensions();
    let mut data = Cursor::new(Vec::new());
    thumb.write_to(&mut data, ImageFormat::Jpeg)?;
    Ok(Some(GeneratedThumbnail {
        width,
        height,
        data: data.into_inner(),
    }))
}

fn thumbnail_view(thumbnail: StoredThumbnail, cached: bool) -> ThumbnailView {
    ThumbnailView {
        mime_type: thumbnail.mime_type.clone(),
        width: thumbnail.width,
        height: thumbnail.height,
        data_url: thumbnail_data_url(&thumbnail.mime_type, &thumbnail.data),
        created_at: Some(thumbnail.created_at),
        cached,
    }
}

fn generated_thumbnail_view(thumbnail: &GeneratedThumbnail) -> ThumbnailView {
    ThumbnailView {
        mime_type: "image/jpeg".to_string(),
        width: thumbnail.width,
        height: thumbnail.height,
        data_url: thumbnail_data_url("image/jpeg", &thumbnail.data),
        created_at: None,
        cached: false,
    }
}

fn thumbnail_data_url(mime_type: &str, data: &[u8]) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
    format!("data:{mime_type};base64,{encoded}")
}

fn exif_for_path(path: &Path) -> ExifView {
    if !is_probably_image(path) {
        return ExifView {
            status: "unsupported".to_string(),
            source_path: Some(path.display().to_string()),
            fields: Vec::new(),
            error: Some("EXIF is only attempted for common image file types.".to_string()),
        };
    }
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) => {
            return ExifView {
                status: "unavailable".to_string(),
                source_path: Some(path.display().to_string()),
                fields: Vec::new(),
                error: Some(error.to_string()),
            };
        }
    };
    let mut reader = BufReader::new(file);
    match exif::Reader::new().read_from_container(&mut reader) {
        Ok(exif) => {
            let mut grouped = BTreeMap::new();
            for field in exif.fields() {
                grouped.insert(
                    format!("{}:{}", field.ifd_num, field.tag),
                    ExifField {
                        group: field.ifd_num.to_string(),
                        tag: field.tag.to_string(),
                        value: field.display_value().with_unit(&exif).to_string(),
                    },
                );
            }
            ExifView {
                status: if grouped.is_empty() { "empty" } else { "ok" }.to_string(),
                source_path: Some(path.display().to_string()),
                fields: grouped.into_values().collect(),
                error: None,
            }
        }
        Err(error) => ExifView {
            status: "unavailable".to_string(),
            source_path: Some(path.display().to_string()),
            fields: Vec::new(),
            error: Some(error.to_string()),
        },
    }
}

struct SourcePath {
    path: PathBuf,
    blake3: String,
    size: u64,
}

fn first_available_occurrence_path(
    db: &Database,
    occurrences: &[FileOccurrence],
) -> Result<Option<SourcePath>> {
    for occurrence in occurrences {
        let path = scan_indexed_path(db, &occurrence.scan_id, &occurrence.path)?;
        if path.is_file() {
            return Ok(Some(SourcePath {
                path,
                blake3: occurrence.blake3.clone(),
                size: occurrence.size,
            }));
        }
    }
    Ok(None)
}

fn scan_indexed_path(db: &Database, scan_id: &str, indexed_path: &str) -> Result<PathBuf> {
    let scan_root = scan_root_path(db, scan_id)?;
    indexed_entry_path(&scan_root, indexed_path)
}

fn scan_root_path(db: &Database, scan_id: &str) -> Result<PathBuf> {
    let scan = db
        .scan_by_id(scan_id)?
        .with_context(|| format!("scan not found: {scan_id}"))?;
    let location = db
        .location_by_slug(&scan.location_slug)?
        .with_context(|| format!("location not found: {}", scan.location_slug))?;
    Ok(location
        .root_path
        .join(normalized_scan_offset_path(&scan.offset_path)?))
}

fn indexed_entry_path(scan_root: &Path, indexed_path: &str) -> Result<PathBuf> {
    let relative = normalized_stored_relative_path(indexed_path, "indexed path")?;
    if relative.is_empty() {
        anyhow::bail!("indexed path must not be the scan root")
    }
    Ok(scan_root.join(relative))
}

fn normalized_scan_offset_path(offset_path: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(normalized_stored_relative_path(
        offset_path,
        "scan offset path",
    )?))
}

/// Validates persisted scan-relative data before it reaches the filesystem.
/// Both separators are parsed so an unsafe Windows-form value cannot bypass
/// the location/scan root when this process runs on a Unix host.
fn normalized_stored_relative_path(path: &str, label: &str) -> Result<String> {
    let mut prefix = path.chars();
    if prefix.next().map_or(false, is_path_separator)
        && prefix.next().map_or(false, is_path_separator)
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

fn is_probably_image(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|extension| extension.to_str()) else {
        return false;
    };
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "tif" | "tiff" | "bmp" | "heic" | "heif"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{LocationInput, LocationType};

    #[test]
    fn media_paths_stay_under_a_nested_scan_offset() {
        let root = test_root("nested-offset");
        std::fs::create_dir_all(&root).unwrap();
        let location_root = root.join("location");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: location_root.clone(),
                notes: None,
            })
            .unwrap();
        let scan_id = db
            .start_scan(&location, Path::new("/nested/album"))
            .unwrap();

        assert_eq!(
            scan_indexed_path(&db, &scan_id, "cover.jpg").unwrap(),
            location_root.join("nested/album/cover.jpg")
        );
    }

    #[test]
    fn stored_paths_reject_traversal_and_device_prefixes() {
        for path in [
            "../outside",
            "nested/../outside",
            r"..\outside",
            r"nested\..\outside",
            r"C:\outside",
            "C:relative",
            "//server/share",
            r"\\server\share",
            r"\\?\C:\outside",
        ] {
            assert!(
                normalized_stored_relative_path(path, "stored path").is_err(),
                "{path}"
            );
        }
        assert_eq!(
            normalized_stored_relative_path(r"nested\album", "stored path").unwrap(),
            "nested/album"
        );
    }

    #[test]
    fn visible_occurrence_details_select_a_supplied_connected_source() {
        let root = test_root("visible-source");
        let location_root = root.join("location");
        let visible_path = location_root.join("nested/album/visible.png");
        std::fs::create_dir_all(visible_path.parent().unwrap()).unwrap();
        image::RgbImage::from_pixel(1, 1, image::Rgb([12, 34, 56]))
            .save(&visible_path)
            .unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: location_root,
                notes: None,
            })
            .unwrap();
        let scan_id = db
            .start_scan(&location, Path::new("/nested/album"))
            .unwrap();
        db.upsert_thumbnail(NewThumbnail {
            blake3: "visible-hash".to_string(),
            size: 1,
            mime_type: "image/jpeg".to_string(),
            width: 99,
            height: 99,
            data: b"unproven-cache".to_vec(),
        })
        .unwrap();

        let without_visible_source = file_details_from_visible_occurrences(&db, &[]).unwrap();
        assert!(without_visible_source.thumbnail.is_none());
        assert_eq!(without_visible_source.exif.status, "unavailable");

        let details = file_details_from_visible_occurrences(
            &db,
            &[
                test_occurrence(&scan_id, "missing.png", "visible-hash", 1),
                test_occurrence(&scan_id, "visible.png", "visible-hash", 1),
            ],
        )
        .unwrap();

        let expected_source_path = visible_path.to_string_lossy().into_owned();
        assert_eq!(details.occurrences.len(), 2);
        assert_eq!(
            details.exif.source_path.as_deref(),
            Some(expected_source_path.as_str())
        );
        assert_eq!(
            details.thumbnail.as_ref().map(|thumbnail| thumbnail.cached),
            Some(false)
        );
        assert_ne!(
            details.thumbnail.as_ref().map(|thumbnail| thumbnail.width),
            Some(99)
        );
    }

    fn test_occurrence(scan_id: &str, path: &str, blake3: &str, size: u64) -> FileOccurrence {
        FileOccurrence {
            scan_id: scan_id.to_string(),
            scan_started_at: String::new(),
            scan_finished_at: None,
            scan_status: "complete".to_string(),
            location_slug: "source".to_string(),
            location_name: "Source".to_string(),
            kind: "file".to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap().to_string(),
            size,
            blake3: blake3.to_string(),
            sha256: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        }
    }

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "file-census-media-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
}
