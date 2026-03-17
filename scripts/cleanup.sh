#!/bin/bash
# Cleanup script for coder-brain

set -e

echo "🧹 Running cleanup tasks..."

# Remove node_modules cache
if [ -d "$HOME/.npm/_cacache" ]; then
    echo "  Clearing npm cache..."
    npm cache clean --force || true
fi

# Remove temporary files
echo "  Removing temporary files..."
find . -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*~" \) -delete 2>/dev/null || true

# Remove test artifacts
echo "  Cleaning test artifacts..."
find . -type d -name "coverage" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".nyc_output" -exec rm -rf {} + 2>/dev/null || true

# Verify git status
echo "\n📊 Git status:"
git status --short || true

echo "\n✅ Cleanup complete!"
