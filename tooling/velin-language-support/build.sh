#!/bin/bash
# Build script for Velin Language Support

set -e

echo "Installing dependencies..."
npm install

echo "Building shared utilities..."
npm run build -w shared

echo "Building LSP server..."
npm run build -w lsp-server

echo "Building VS Code extension..."
npm run build -w vscode-extension

echo "Build complete."

echo ""
echo "Next steps:"
echo "  - Test: Open vscode-extension/ in VS Code and press F5"
echo "  - Package: npm run package:vscode"
echo "  - Publish: npm run publish:vscode"
