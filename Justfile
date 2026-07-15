set dotenv-load

db := env_var_or_default("FILE_CENSUS_DB", "")
port := env_var_or_default("FILE_CENSUS_PORT", "3838")
dev := "nix develop -c"

default:
    @just --list

# Build the embedded React UI and Rust browser-server binary.
build:
    {{dev}} /bin/sh -c 'npm --prefix ui run build && cargo build -p file-census-backend'

# Run isolated React component previews.
ui-preview:
    {{dev}} npm --prefix ui run preview

# Build and run a fresh compiled instance.
run: build
    if [ -n "{{db}}" ]; then ./target/debug/file-census --db "{{db}}" serve --port {{port}}; else ./target/debug/file-census serve --port {{port}}; fi

# Build and run the web app with an explicit database file.
run-with-db db_filename: build
    ./target/debug/file-census --db "{{db_filename}}" serve --port {{port}}

# Build and run without opening the browser.
run-no-open: build
    if [ -n "{{db}}" ]; then ./target/debug/file-census --db "{{db}}" serve --port {{port}} --no-open; else ./target/debug/file-census serve --port {{port}} --no-open; fi

# Build an optimized single binary.
release:
    {{dev}} /bin/sh -c 'npm --prefix ui run build && cargo build -p file-census-backend --release'

# Run the Tauri desktop app in development mode.
desktop-dev:
    cd src/native_app && {{dev}} ../../ui/node_modules/.bin/tauri dev

# Build and run a fresh compiled native desktop app.
desktop-run:
    {{dev}} /bin/sh -c 'npm --prefix ui run build && cargo run -p file-census-native-app'

# Build the Tauri desktop app bundle for the current platform.
desktop-build:
    cd src/native_app && {{dev}} ../../ui/node_modules/.bin/tauri build

# Build a macOS .app bundle.
desktop-build-app:
    cd src/native_app && {{dev}} ../../ui/node_modules/.bin/tauri build --bundles app

# Build a Linux AppImage bundle. Run this on Linux.
desktop-build-appimage:
    cd src/native_app && {{dev}} ../../ui/node_modules/.bin/tauri build --bundles appimage

# Build the Tauri desktop Rust crate without packaging.
desktop-check:
    {{dev}} /bin/sh -c 'npm --prefix ui run build && cargo build -p file-census-native-app'

# Run explicit ignored performance gates for scan/tree/delete hot paths.
perf-gates:
    {{dev}} cargo test -p file-census-backend --test perf_gates --release -- --ignored --nocapture

# Benchmark metadata-aware filesystem discovery on a real path.
bench-discovery path threads="3":
    {{dev}} cargo build -p file-census-backend --release
    ./target/release/file-census --json scans benchmark-discovery "{{path}}" --threads {{threads}}
