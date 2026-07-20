fn main() {
    // Light-hash sampler config (plan-071). build.rs is the single source of
    // truth: it reads the real build environment, applies the defaults, and
    // re-emits every knob as a `rustc-env` so scanner.rs's `option_env!` sees a
    // stable value AND cargo recompiles when a knob changes. Defaults here MUST
    // match scanner.rs's fallbacks. The head and tail slices are configured
    // independently and default larger than the interior slices.
    let light_hash_slice_count = env_usize("FILE_CENSUS_LIGHT_HASH_SLICE_COUNT", 5);
    if light_hash_slice_count < 5 {
        panic!("FILE_CENSUS_LIGHT_HASH_SLICE_COUNT must be at least 5");
    }
    let light_hash_slice_width = env_u64("FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH", 4 * 1024 * 1024);
    if light_hash_slice_width == 0 {
        panic!("FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH must be greater than 0");
    }
    let light_hash_head_slice_width =
        env_u64("FILE_CENSUS_LIGHT_HASH_HEAD_SLICE_WIDTH", 8 * 1024 * 1024);
    if light_hash_head_slice_width == 0 {
        panic!("FILE_CENSUS_LIGHT_HASH_HEAD_SLICE_WIDTH must be greater than 0");
    }
    let light_hash_tail_slice_width =
        env_u64("FILE_CENSUS_LIGHT_HASH_TAIL_SLICE_WIDTH", 8 * 1024 * 1024);
    if light_hash_tail_slice_width == 0 {
        panic!("FILE_CENSUS_LIGHT_HASH_TAIL_SLICE_WIDTH must be greater than 0");
    }
    println!("cargo:rustc-env=FILE_CENSUS_LIGHT_HASH_SLICE_COUNT={light_hash_slice_count}");
    println!("cargo:rustc-env=FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH={light_hash_slice_width}");
    println!("cargo:rustc-env=FILE_CENSUS_LIGHT_HASH_HEAD_SLICE_WIDTH={light_hash_head_slice_width}");
    println!("cargo:rustc-env=FILE_CENSUS_LIGHT_HASH_TAIL_SLICE_WIDTH={light_hash_tail_slice_width}");
    println!("cargo:rerun-if-env-changed=FILE_CENSUS_LIGHT_HASH_SLICE_COUNT");
    println!("cargo:rerun-if-env-changed=FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH");
    println!("cargo:rerun-if-env-changed=FILE_CENSUS_LIGHT_HASH_HEAD_SLICE_WIDTH");
    println!("cargo:rerun-if-env-changed=FILE_CENSUS_LIGHT_HASH_TAIL_SLICE_WIDTH");

    // Only `ui/dist` is embedded (rust-embed `#[folder="../../ui/dist/"]`), so
    // that is the ONLY thing the backend must rebuild for. Editing `ui/src`
    // does not change the binary until `vite build` regenerates `ui/dist`, so
    // watching `ui/src` here only produced spurious backend recompiles.
    println!("cargo:rerun-if-changed=../../ui/dist");
    if let Ok(entries) = walkdir::WalkDir::new("../../ui/dist")
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
    {
        for entry in entries {
            if entry.file_type().is_file() {
                println!("cargo:rerun-if-changed={}", entry.path().display());
            }
        }
    }
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            value
                .parse::<usize>()
                .unwrap_or_else(|_| panic!("{name} must be an unsigned integer"))
        })
        .unwrap_or(default)
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            value
                .parse::<u64>()
                .unwrap_or_else(|_| panic!("{name} must be an unsigned integer"))
        })
        .unwrap_or(default)
}
