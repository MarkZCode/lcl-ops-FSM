#!/bin/bash
# Double-click this file to start LCL Ops.
# It uses the portable Node bundled for this project (no system install needed).
export PATH="$HOME/.lcl-node/node-v20.18.0-darwin-x64/bin:$PATH"
cd "$(dirname "$0")"
echo "Starting LCL Ops…"
echo "Open http://localhost:3200 in your browser."
echo "(Press Ctrl+C in this window to stop.)"
node node_modules/next/dist/bin/next dev -p 3200 -H 0.0.0.0
