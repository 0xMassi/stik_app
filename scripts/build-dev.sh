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
Usage: ./scripts/build-dev.sh [dev|build|sidecar]

  dev       Build DarwinKit, then start Tauri with hot reload (default)
  build     Build DarwinKit and a local debug Stik.app for this Mac
  sidecar   Build and install only the DarwinKit sidecar
EOF
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
  [[ "$(uname -s)" == "Darwin" ]] || fail "Stik development builds require macOS"

  require_command node "Install Node.js 20 or newer."
  require_command npm "Install npm with Node.js."
  require_command rustc "Install Rust with rustup."
  require_command cargo "Install Rust with rustup."
  require_command swift "Install the Xcode command-line tools."
  require_command protoc "Install protobuf with: brew install protobuf"

  cd "$REPO_ROOT"
  npm run check:platform
  if [[ ! -d node_modules ]]; then
    log "Installing npm dependencies"
    npm ci
  fi

  resolve_architecture

  case "$mode" in
    dev)
      build_sidecar debug
      log "Starting Tauri development mode (${RUST_TARGET})"
      exec npm run tauri -- dev --target "$RUST_TARGET"
      ;;
    build)
      build_sidecar debug
      log "Building local Stik.app (${RUST_TARGET})"
      npm run tauri -- build \
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
