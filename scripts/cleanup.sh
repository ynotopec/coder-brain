#!/usr/bin/env bash
# Cleanup script for coder-brain

set -euo pipefail

echo "🧹 Removing generated and temporary files..."

# Common local artifacts
rm -rf coverage .nyc_output .eslintcache

# Node temporary logs and editor backups
find . -type f \( -name "*.log" -o -name "*.tmp" -o -name "*.temp" -o -name "*~" \) -delete

echo "📊 Git status (short):"
git status --short || true

echo "✅ Cleanup complete"
