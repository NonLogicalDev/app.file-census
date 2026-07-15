use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};

pub fn default_db_path() -> Result<PathBuf> {
    let data_dir = platform_data_dir()?;
    std::fs::create_dir_all(&data_dir)
        .with_context(|| format!("creating {}", data_dir.display()))?;
    Ok(data_dir.join("file-census.db"))
}

fn platform_data_dir() -> Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").ok_or_else(|| anyhow!("HOME is not set"))?;
        return Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("file-census"));
    }

    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA").ok_or_else(|| anyhow!("APPDATA is not set"))?;
        return Ok(PathBuf::from(appdata).join("file-census"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(data_home).join("file-census"));
        }
        let home = std::env::var_os("HOME").ok_or_else(|| anyhow!("HOME is not set"))?;
        return Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("file-census"));
    }

    #[allow(unreachable_code)]
    Err(anyhow!("unsupported platform for default database path"))
}
