#!/bin/bash

# Stik Release Script
# Usage: ./scripts/release.sh [major|minor|patch|x.y.z]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "\n${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}Stik Release${NC}"
echo "Current version: ${CURRENT_VERSION}"
echo ""

# Parse version argument
if [ -z "$1" ]; then
    echo "Usage: ./scripts/release.sh [major|minor|patch|x.y.z]"
    echo ""
    echo "Examples:"
    echo "  ./scripts/release.sh patch   # 0.1.0 -> 0.1.1"
    echo "  ./scripts/release.sh minor   # 0.1.0 -> 0.2.0"
    echo "  ./scripts/release.sh major   # 0.1.0 -> 1.0.0"
    echo "  ./scripts/release.sh 0.2.0   # explicit version"
    exit 1
fi

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$1" in
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
        ;;
    *)
        # Validate explicit version format
        if [[ ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            print_error "Invalid version format. Use x.y.z (e.g., 1.2.3)"
        fi
        NEW_VERSION="$1"
        ;;
esac

echo -e "New version: ${GREEN}${NEW_VERSION}${NC}"
echo ""

# Confirm
read -p "Proceed with release v${NEW_VERSION}? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    print_error "You have uncommitted changes. Please commit or stash them first."
fi

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${YELLOW}Warning: You're on branch '${CURRENT_BRANCH}', not 'main'.${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# Update package.json
print_step "Updating package.json..."
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json
print_success "package.json updated"

# Update Cargo.toml
print_step "Updating Cargo.toml..."
sed -i '' "s/^version = \"${CURRENT_VERSION}\"/version = \"${NEW_VERSION}\"/" src-tauri/Cargo.toml
print_success "Cargo.toml updated"

# Update tauri.conf.json if it has version
if grep -q '"version"' src-tauri/tauri.conf.json 2>/dev/null; then
    print_step "Updating tauri.conf.json..."
    sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" src-tauri/tauri.conf.json
    print_success "tauri.conf.json updated"
fi

# Update CHANGELOG.md - replace [Unreleased] date
print_step "Updating CHANGELOG.md..."
TODAY=$(date +%Y-%m-%d)
sed -i '' "s/## \[Unreleased\]/## [Unreleased]\n\n## [${NEW_VERSION}] - ${TODAY}/" CHANGELOG.md
# Add new version to links at bottom
sed -i '' "s|\[Unreleased\]: \(.*\)/compare/v${CURRENT_VERSION}...HEAD|[Unreleased]: \1/compare/v${NEW_VERSION}...HEAD\n[${NEW_VERSION}]: \1/compare/v${CURRENT_VERSION}...v${NEW_VERSION}|" CHANGELOG.md
print_success "CHANGELOG.md updated"

# Update Cargo.lock
print_step "Updating Cargo.lock..."
cd src-tauri && cargo check --quiet 2>/dev/null && cd ..
print_success "Cargo.lock updated"

# Git commit
print_step "Creating git commit..."
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
if [ -f src-tauri/tauri.conf.json ]; then
    git add src-tauri/tauri.conf.json 2>/dev/null || true
fi
git commit -m "Release v${NEW_VERSION}"
print_success "Committed"

# Git tag
print_step "Creating git tag..."
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
print_success "Tagged v${NEW_VERSION}"

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Released v${NEW_VERSION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git show HEAD"
echo "  2. Push to remote:     git push origin main --tags"
echo "  3. Build release:      npm run tauri build"
echo ""
echo "To undo this release:"
echo "  git tag -d v${NEW_VERSION}"
echo "  git reset --hard HEAD~1"
