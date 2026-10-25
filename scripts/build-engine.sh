#!/usr/bin/env bash
# Linux / macOS: compiles the C++ engine. Run from anywhere:  bash scripts/build-engine.sh
set -euo pipefail
cd "$(dirname "$0")/.."
command -v g++ >/dev/null || { echo "ERROR: g++ not found (sudo apt install g++)"; exit 1; }
mkdir -p engine/build
g++ -std=c++17 -O2 -Wall -Wextra -Iengine/include engine/src/*.cpp -o engine/build/admitqueue_engine -static-libgcc -static-libstdc++
echo '{"op":"health"}' | engine/build/admitqueue_engine
echo "OK: engine/build/admitqueue_engine"
