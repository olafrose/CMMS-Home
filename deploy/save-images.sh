#!/usr/bin/env bash
# Path B (no registry): build the amd64 images here and save them to a tarball you
# copy to the NAS (File Station / SMB) and `docker load`. Then set API_IMAGE/WEB_IMAGE
# in .env to these local tags (cmms-api:test / cmms-web:test).
#
# Usage (from the repo root):
#   TAG=test ./deploy/save-images.sh   # -> cmms-images-test.tar
set -euo pipefail
: "${TAG:=test}"

docker build --platform linux/amd64 -t "cmms-api:$TAG" -f src/CmmsHome.Api/Dockerfile .
docker build --platform linux/amd64 -t "cmms-web:$TAG" -f src/cmms-home-web/Dockerfile src/cmms-home-web

out="cmms-images-$TAG.tar"
docker save "cmms-api:$TAG" "cmms-web:$TAG" -o "$out"
echo "Wrote $out ($(du -h "$out" | cut -f1)). Copy it to the NAS, then: docker load -i $out"
