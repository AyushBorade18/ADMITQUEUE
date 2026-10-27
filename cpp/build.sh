#!/bin/sh
# Compiles every C++ program in this folder into cpp/build/   (needs g++)
#   ./build.sh            build all
cd "$(dirname "$0")" || exit 1
mkdir -p build
echo "Building the engine ..."
g++ -std=c++11 -O2 -Wall engine/main.cpp -o build/engine || exit 1
for f in demos/*.cpp; do
  name=$(basename "$f" .cpp)
  echo "Building $name ..."
  g++ -std=c++11 -O2 -Wall "$f" -o "build/$name" || exit 1
done
echo "Done. Run for example:  ./build/02_linked_list_demo   or   ./build/08_allotment_demo"
