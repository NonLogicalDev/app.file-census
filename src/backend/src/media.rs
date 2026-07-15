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

pub fn build_thumbnails(
    db: &Database,
    scan_id: &str,
    prefix: &str,
    recursive: bool,
) -> Result<BuildThumbnailsResult> {
    let scan = db
        .scan_by_id(scan_id)?
        .with_context(|| format!("scan not found: {scan_id}"))?;
    let candidates = db.thumbnail_candidates(scan_id, prefix, recursive)?;
    build_thumbnails_for_candidates(
        db,
        scan_id,
        &scan.location_slug,
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
    let scan = db
        .scan_by_id(scan_id)?
        .with_context(|| format!("scan not found: {scan_id}"))?;
    let candidates = db.thumbnail_candidates_paths(scan_id, paths, recursive)?;
    build_thumbnails_for_candidates(
        db,
        scan_id,
        &scan.location_slug,
        path,
        recursive,
        candidates,
    )
}

fn build_thumbnails_for_candidates(
    db: &Database,
    scan_id: &str,
    location_slug: &str,
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
        let candidate_path = location_child_path(db, location_slug, &candidate.path)?;
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

fn build_thumbnail_for_candidate(
    db: &Database,
    candidate: &ThumbnailCandidate,
    path: &Path,
) -> Result<Option<ThumbnailView>> {
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
    let data = data.into_inner();
    db.upsert_thumbnail(NewThumbnail {
        blake3: candidate.blake3.clone(),
        size: candidate.size,
        mime_type: "image/jpeg".to_string(),
        width,
        height,
        data,
    })?;
    Ok(db
        .thumbnail(&candidate.blake3, candidate.size)?
        .map(|thumbnail| thumbnail_view(thumbnail, false)))
}

fn thumbnail_view(thumbnail: StoredThumbnail, cached: bool) -> ThumbnailView {
    let encoded = base64::engine::general_purpose::STANDARD.encode(&thumbnail.data);
    ThumbnailView {
        mime_type: thumbnail.mime_type.clone(),
        width: thumbnail.width,
        height: thumbnail.height,
        data_url: format!("data:{};base64,{encoded}", thumbnail.mime_type),
        created_at: Some(thumbnail.created_at),
        cached,
    }
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
}

fn first_available_occurrence_path(
    db: &Database,
    occurrences: &[FileOccurrence],
) -> Result<Option<SourcePath>> {
    for occurrence in occurrences {
        let path = location_child_path(db, &occurrence.location_slug, &occurrence.path)?;
        if path.is_file() {
            return Ok(Some(SourcePath { path }));
        }
    }
    Ok(None)
}

fn location_child_path(db: &Database, slug: &str, relative_path: &str) -> Result<PathBuf> {
    let location = db
        .location_by_slug(slug)?
        .with_context(|| format!("location not found: {slug}"))?;
    Ok(location.root_path.join(clean_relative_path(relative_path)))
}

fn clean_relative_path(path: &str) -> PathBuf {
    path.trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect()
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
