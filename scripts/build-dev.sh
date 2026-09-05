#!/bin/bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly DARWINKIT_DIR="${REPO_ROOT}/src-tauri/darwinkit"
readonly SIDECAR_DIR="${REPO_ROOT}/src-tauri/binaries"

log() {
  printf '==> %s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

on_error() {
  printf 'error: build failed at line %s\n' "$1" >&2
}

trap 'on_error "$LINENO"' ERR

usage() {
  cat <<'EOF'
Usage: ./scripts/build-dev.sh [doctor|setup|dev|qa|build|sidecar]

  doctor    Check local prerequisites without installing or building
  setup     Initialize submodules, install dependencies, build sidecar and frontend
  dev       Start Stik Dev with isolated data and hot reload (default)
  qa        Build and launch an isolated Stik Dev.app for native UI automation
  build     Build DarwinKit and a local debug Stik.app for this Mac
  sidecar   Build and install only the DarwinKit sidecar
EOF
}

prepare_dev_session() {
  if [[ "$1" == dev ]]; then
  export STIK_DEV_PORT="${STIK_DEV_PORT:-1420}"
  node --input-type=module -e '
    import net from "node:net";
    const port = Number(process.env.STIK_DEV_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      console.error("STIK_DEV_PORT must be an integer from 1024 to 65535");
      process.exit(1);
    }
    const probe = net.createServer();
    probe.once("error", error => {
      console.error(`Cannot use development port ${port}: ${error.code}. Choose STIK_DEV_PORT=1422; do not kill another session.`);
      process.exit(1);
    });
    probe.listen(port, "127.0.0.1", () => probe.close());
  '
  fi
  if [[ -z "${STIK_DEV_ROOT:-}" ]]; then
    STIK_DEV_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/stik-dev.XXXXXX")"
  fi
  [[ "$STIK_DEV_ROOT" == /* && "$STIK_DEV_ROOT" != / && "/$STIK_DEV_ROOT/" != */../* ]] ||
    fail "STIK_DEV_ROOT must be an absolute, non-root path without '..'"
  export STIK_DEV_ROOT
  mkdir -p "$STIK_DEV_ROOT/logs"
  STIK_DEV_ROOT="$(cd -- "$STIK_DEV_ROOT" && pwd -P)"
  log "Isolated data: $STIK_DEV_ROOT (retained after exit)"
  log "Native and Vite logs: $STIK_DEV_ROOT/logs/dev.log"
}

require_command() {
  local -r command_name="$1"
  local -r install_hint="$2"
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "${command_name} is required. ${install_hint}"
}

resolve_architecture() {
  case "$(uname -m)" in
    arm64)
      SWIFT_ARCH="arm64"
      RUST_TARGET="aarch64-apple-darwin"
      ;;
    x86_64)
      SWIFT_ARCH="x86_64"
      RUST_TARGET="x86_64-apple-darwin"
      ;;
    *)
      fail "unsupported Mac architecture: $(uname -m)"
      ;;
  esac
  readonly SWIFT_ARCH RUST_TARGET
}

build_sidecar() {
  local -r configuration="$1"

  [[ -f "${DARWINKIT_DIR}/Package.swift" ]] ||
    fail "DarwinKit is missing. Run: git submodule update --init --recursive"

  log "Building DarwinKit (${configuration}, ${SWIFT_ARCH})"
  swift build \
    --package-path "$DARWINKIT_DIR" \
    --configuration "$configuration" \
    --arch "$SWIFT_ARCH"

  local bin_path
  bin_path="$(swift build \
    --package-path "$DARWINKIT_DIR" \
    --configuration "$configuration" \
    --arch "$SWIFT_ARCH" \
    --show-bin-path)"
  local -r source_binary="${bin_path}/darwinkit"
  local -r target_binary="${SIDECAR_DIR}/darwinkit-${RUST_TARGET}"

  [[ -x "$source_binary" ]] || fail "DarwinKit binary not found at ${source_binary}"
  mkdir -p "$SIDECAR_DIR"
  install -m 755 "$source_binary" "$target_binary"
  log "Installed sidecar at ${target_binary}"
}

main() {
  local -r mode="${1:-dev}"

  if [[ "$mode" == "-h" || "$mode" == "--help" ]]; then
    usage
    return 0
  fi
  [[ $# -le 1 ]] || fail "expected at most one mode argument"
  case "$mode" in doctor|setup|dev|qa|build|sidecar) ;; *) usage >&2; fail "unknown mode: $mode" ;; esac
  [[ "$(uname -s)" == "Darwin" ]] || fail "Stik development builds require macOS"

  require_command node "Install Node.js 20 or newer."
  node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20 or newer is required"); process.exit(1); }'
  require_command bun "Install the Bun version in .bun-version."
  local -r bun_version="$(<"${REPO_ROOT}/.bun-version")"
  [[ "$(bun --version)" == "$bun_version" ]] ||
    fail "Bun ${bun_version} is required (see .bun-version)."
  require_command rustc "Install Rust with rustup."
  require_command cargo "Install Rust with rustup."
  require_command swift "Install the Xcode command-line tools."
  require_command protoc "Install protobuf with: brew install protobuf"
  require_command git "Install the Xcode command-line tools."
  cargo clippy --version >/dev/null || fail "Install Clippy: rustup component add clippy"
  cargo fmt --version >/dev/null || fail "Install rustfmt: rustup component add rustfmt"

  cd "$REPO_ROOT"
  if [[ "$mode" == doctor ]]; then
    [[ -f "$DARWINKIT_DIR/Package.swift" ]] || fail "DarwinKit is missing. Run: ./scripts/build-dev.sh setup"
    bun run check:platform
    log "Prerequisites ready: Bun $(bun --version), Node $(node --version), $(rustc --version)"
    return
  fi
  if [[ "$mode" == dev || "$mode" == qa ]]; then prepare_dev_session "$mode"; fi
  log "Initializing pinned submodules"
  git submodule update --init --recursive
  bun run check:platform
  log "Installing locked frontend dependencies"
  bun install --frozen-lockfile

  resolve_architecture

  case "$mode" in
    dev)
      build_sidecar debug
      local dev_config
      dev_config="$(node -e 'process.stdout.write(JSON.stringify({identifier:"com.stik.dev",productName:"Stik Dev",build:{devUrl:`http://127.0.0.1:${process.env.STIK_DEV_PORT}`}}))')"
      log "Starting Stik Dev (${RUST_TARGET}, port ${STIK_DEV_PORT})"
      bun run tauri dev --target "$RUST_TARGET" --config "$dev_config" 2>&1 | tee "$STIK_DEV_ROOT/logs/dev.log"
      ;;
    setup)
      build_sidecar debug
      bun run build
      ;;
    qa)
      build_sidecar debug
      bun run tauri build --debug --target "$RUST_TARGET" --bundles app \
        --config '{"identifier":"com.stik.dev","productName":"Stik Dev","bundle":{"createUpdaterArtifacts":false}}'
      log "Launching Stik Dev.app; stop with Ctrl-C"
      "$REPO_ROOT/src-tauri/target/$RUST_TARGET/debug/bundle/macos/Stik Dev.app/Contents/MacOS/stik" \
        2>&1 | tee "$STIK_DEV_ROOT/logs/dev.log"
      ;;
    build)
      build_sidecar debug
      log "Building local Stik.app (${RUST_TARGET})"
      bun run tauri build \
        --debug \
        --target "$RUST_TARGET" \
        --bundles app \
        --config '{"bundle":{"createUpdaterArtifacts":false}}'
      log "App ready at src-tauri/target/${RUST_TARGET}/debug/bundle/macos/Stik.app"
      ;;
    sidecar)
      build_sidecar debug
      ;;
    *)
      usage >&2
      fail "unknown mode: ${mode}"
      ;;
  esac
}

main "$@"
