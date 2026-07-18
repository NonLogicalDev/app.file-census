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

    println!("cargo:rerun-if-changed=../../ui/dist");
    println!("cargo:rerun-if-changed=../../ui/src");
    println!("cargo:rerun-if-changed=../../ui/index.html");
    println!("cargo:rerun-if-changed=../../ui/package.json");
    println!("cargo:rerun-if-changed=../../ui/postcss.config.js");
    println!("cargo:rerun-if-changed=../../ui/tailwind.config.js");
    println!("cargo:rerun-if-changed=../../ui/vite.config.js");

    for root in ["../../ui/dist", "../../ui/src"] {
        if let Ok(entries) = walkdir::WalkDir::new(root)
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
