echo "Published to npm."
echo "\nCDN usage (after publish):"
echo "  https://cdn.jsdelivr.net/npm/velin@<version>/velin-all.min.js"
echo "  https://unpkg.com/velin@<version>/velin-all.min.js"

#!/bin/bash
# publish.sh - Publishes the package from ./publish using an NPM token and creates a GitHub release
# Usage: NPM_TOKEN=your-token ./scripts/publish.sh
set -e

if [ -z "$NPM_TOKEN" ]; then
  echo "Error: NPM_TOKEN environment variable not set."
  exit 1
fi

# Get version from package.json
ROOT_DIR="$(dirname "$0")/.."
VERSION=$(node -p "require('$ROOT_DIR/package.json').version")
REPO="$(basename $(git config --get remote.origin.url) .git)"
OWNER=$(basename $(dirname $(git config --get remote.origin.url)))

# Publish to npm
cd "$ROOT_DIR/publish"
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc
npm publish --access public
rm .npmrc

echo "Published to npm."
echo "\nCDN usage (after publish):"
echo "  https://cdn.jsdelivr.net/npm/velin@$VERSION/velin-all.min.js"
echo "  https://unpkg.com/velin@$VERSION/velin-all.min.js"

# Tag and create GitHub release
cd "$ROOT_DIR"
git tag "v$VERSION"
git push origin "v$VERSION"
gh release create "v$VERSION" --title "v$VERSION" --notes "Hey! New release. Check commits for details."
echo "GitHub release v$VERSION created."
