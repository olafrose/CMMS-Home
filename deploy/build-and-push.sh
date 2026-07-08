#!/usr/bin/env bash
# Path A: build the amd64 images on this machine and push them to a registry.
# The Synology (Intel J4025 = amd64) then pulls them — no build on the NAS.
#
# Prereqs: `docker login <registry>` first (Docker Hub: `docker login`;
#          GHCR: `docker login ghcr.io -u <user>` with a PAT that has write:packages).
#
# Usage (from the repo root):
#   API_IMAGE=docker.io/<you>/cmms-api:test WEB_IMAGE=docker.io/<you>/cmms-web:test ./deploy/build-and-push.sh
set -euo pipefail

: "${API_IMAGE:?set API_IMAGE, e.g. docker.io/<you>/cmms-api:test}"
: "${WEB_IMAGE:?set WEB_IMAGE, e.g. docker.io/<you>/cmms-web:test}"

# Build for amd64 explicitly (matches the NAS even if you build on arm).
docker build --platform linux/amd64 -t "$API_IMAGE" -f src/CmmsHome.Api/Dockerfile .
docker build --platform linux/amd64 -t "$WEB_IMAGE" -f src/cmms-home-web/Dockerfile src/cmms-home-web

docker push "$API_IMAGE"
docker push "$WEB_IMAGE"

echo "Pushed:"
echo "  $API_IMAGE"
echo "  $WEB_IMAGE"
