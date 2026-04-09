#!/usr/bin/env bash
# Release script — bumps version everywhere, tags, and pushes.
#
# Usage:
#   bash scripts/release.sh patch   # 0.1.0 → 0.1.1
#   bash scripts/release.sh minor   # 0.1.1 → 0.2.0
#   bash scripts/release.sh major   # 0.2.0 → 1.0.0
#   bash scripts/release.sh 0.3.0   # explicit version

set -euo pipefail

BUMP="${1:-}"

if [ -z "$BUMP" ]; then
  echo "Usage: bash scripts/release.sh <patch|minor|major|x.y.z>"
  exit 1
fi

# Read current version from package.json (single source of truth)
CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"

# Calculate new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$BUMP"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    major) NEW="$((MAJOR + 1)).0.0" ;;
    minor) NEW="$MAJOR.$((MINOR + 1)).0" ;;
    patch) NEW="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    *) echo "Unknown bump type: $BUMP"; exit 1 ;;
  esac
fi

echo "New version: $NEW"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes. Commit or stash first."
  exit 1
fi

# Check we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Warning: you're on '$BRANCH', not main. Continue? [y/N]"
  read -r REPLY
  [[ "$REPLY" =~ ^[Yy]$ ]] || exit 1
fi

# Bump version in all files
echo "Updating package.json..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Updating frontend/package.json..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'));
  pkg.version = '$NEW';
  fs.writeFileSync('frontend/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Updating backend/pyproject.toml..."
sed -i '' "s/^version = \".*\"/version = \"$NEW\"/" backend/pyproject.toml

# Commit and tag
git add package.json frontend/package.json backend/pyproject.toml
git commit -m "release: v$NEW"
git tag "v$NEW"

echo ""
echo "Done. Version bumped to $NEW and tagged v$NEW."
echo ""
echo "Next steps:"
echo "  1. Update CHANGELOG.md with what changed"
echo "  2. git push && git push --tags"
echo "  3. Optionally create a GitHub release: gh release create v$NEW"
