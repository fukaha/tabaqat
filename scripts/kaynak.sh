#!/bin/sh
# Gizli kaynak deposunu (tam metinler, ham kaynaklar) kaynak/ altına getirir ve işleme hattının
# beklediği yerlere bağlar. Erişim için fukaha/tabaqat-kaynak deposuna okuma izni gerekir.
set -e
cd "$(dirname "$0")/.."
[ -d kaynak/.git ] || git clone https://github.com/fukaha/tabaqat-kaynak kaynak
git -C kaynak pull --ff-only
for d in entries clean; do [ -e data/$d ] || ln -s ../kaynak/data/$d data/$d; done
for b in kaynak/sources/*/; do n=$(basename "$b"); [ -e sources/$n/raw ] || { mkdir -p sources/$n; ln -s ../../kaynak/sources/$n/raw sources/$n/raw; }; done
echo "kaynak hazır: $(git -C kaynak rev-parse --short HEAD)"
