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

# Build (release) and run a fresh optimized web instance. USE THIS FOR BROWSING:
# debug SQLite is ~20-30x slower, so folder navigation is 3-5s in `run` vs
# ~0.15s here on large scans.
run-release: release
    if [ -n "{{db}}" ]; then ./target/release/file-census --db "{{db}}" serve --port {{port}}; else ./target/release/file-census serve --port {{port}}; fi

# Release web app with an explicit database file.
run-with-db-release db_filename: release
    ./target/release/file-census --db "{{db_filename}}" serve --port {{port}}

# Release web app without opening the browser.
run-no-open-release: release
    if [ -n "{{db}}" ]; then ./target/release/file-census --db "{{db}}" serve --port {{port}} --no-open; else ./target/release/file-census serve --port {{port}} --no-open; fi

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

# Install the release CLI binary into ~/.local/bin (override with PREFIX).
install-cli prefix=env_var_or_default("PREFIX", `echo "$HOME/.local/bin"`): release
    mkdir -p "{{prefix}}"
    install -m 755 target/release/file-census "{{prefix}}/file-census"
    @echo "installed {{prefix}}/file-census ($("{{prefix}}/file-census" --version 2>/dev/null || echo ok))"

# Build the macOS desktop app bundle and install it into /Applications.
install-desktop: desktop-build-app
    #!/usr/bin/env sh
    set -e
    APP=$(find target src/native_app/target -type d -name "file-census.app" -path "*bundle/macos*" 2>/dev/null | head -1)
    if [ -z "$APP" ]; then echo "error: file-census.app bundle not found after build" >&2; exit 1; fi
    rm -rf /Applications/file-census.app
    cp -R "$APP" /Applications/
    echo "installed /Applications/file-census.app (from $APP)"

# Run explicit ignored performance gates for scan/tree/delete hot paths.
perf-gates:
    {{dev}} cargo test -p file-census-backend --features perf-gates --test perf_gates --release -- --ignored --nocapture

# Benchmark metadata-aware filesystem discovery on a real path.
bench-discovery path threads="3":
    {{dev}} cargo build -p file-census-backend --release
    ./target/release/file-census --json scans benchmark-discovery "{{path}}" --threads {{threads}}
