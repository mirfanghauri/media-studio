#!/usr/bin/env bash
# ==============================================================================
# Media Studio — Docker Image Build & Versioned Publishing Script
# Builds and tags multi-service images with explicit SemVer version tags,
# ensuring production deployments do not rely exclusively on mutable latest tags.
#
# Usage:
#   ./scripts/publish-docker.sh [VERSION] [--push] [--dry-run]
#
# Examples:
#   ./scripts/publish-docker.sh 1.0.0
#   ./scripts/publish-docker.sh 1.0.0 --push
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-}"
PUSH=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --push)
      PUSH=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
  esac
done

if [[ -z "${VERSION}" || "${VERSION}" == --* ]]; then
  # Fallback to package.json version in api/package.json
  VERSION="$(grep -m1 '"version"' "${ROOT_DIR}/api/package.json" | cut -d'"' -f4)"
  echo "ℹ️  No version specified. Auto-detected version: ${VERSION}"
fi

# Strip leading 'v' if provided (e.g. v1.0.0 -> 1.0.0)
VERSION="${VERSION#v}"

# Extract Major and Minor versions (e.g. 1.0.0 -> 1.0, 1)
MAJOR="$(echo "${VERSION}" | cut -d. -f1)"
MINOR="$(echo "${VERSION}" | cut -d. -f2)"
MAJOR_MINOR="${MAJOR}.${MINOR}"

REGISTRY_PREFIX="irfanghori"
GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

echo "======================================================================"
echo "🚀 Media Studio — Publishing Versioned Docker Images"
echo "======================================================================"
echo "  Primary Version Tag : ${VERSION}"
echo "  Minor Version Tag   : ${MAJOR_MINOR}"
echo "  Major Version Tag   : ${MAJOR}"
echo "  Commit SHA Tag      : sha-${GIT_SHA}"
echo "  Latest Tag          : latest"
echo "  Push to Registry    : ${PUSH}"
echo "  Dry Run             : ${DRY_RUN}"
echo "======================================================================"

declare -A SERVICES=(
  ["api"]="api/Dockerfile:."
  ["worker"]="worker/Dockerfile:."
  ["queue-monitor"]="dashboard/Dockerfile:./dashboard"
  ["frontend"]="frontend/Dockerfile:./frontend"
)

for SERVICE in "${!SERVICES[@]}"; do
  SPEC="${SERVICES[$SERVICE]}"
  DOCKERFILE="${SPEC%%:*}"
  CONTEXT="${SPEC##*:}"

  IMAGE_NAME="${REGISTRY_PREFIX}/media-studio-${SERVICE}"

  echo ""
  echo "🔨 Building service: ${SERVICE} (${IMAGE_NAME})..."
  echo "   Context    : ${ROOT_DIR}/${CONTEXT}"
  echo "   Dockerfile : ${ROOT_DIR}/${DOCKERFILE}"

  BUILD_CMD=(
    docker build
    -f "${ROOT_DIR}/${DOCKERFILE}"
    -t "${IMAGE_NAME}:${VERSION}"
    -t "${IMAGE_NAME}:${MAJOR_MINOR}"
    -t "${IMAGE_NAME}:${MAJOR}"
    -t "${IMAGE_NAME}:sha-${GIT_SHA}"
    -t "${IMAGE_NAME}:latest"
    "${ROOT_DIR}/${CONTEXT}"
  )

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "   [DRY-RUN] ${BUILD_CMD[*]}"
  else
    "${BUILD_CMD[@]}"
    echo "   ✅ Built tags:"
    echo "      - ${IMAGE_NAME}:${VERSION}"
    echo "      - ${IMAGE_NAME}:${MAJOR_MINOR}"
    echo "      - ${IMAGE_NAME}:${MAJOR}"
    echo "      - ${IMAGE_NAME}:sha-${GIT_SHA}"
    echo "      - ${IMAGE_NAME}:latest"
  fi

  if [[ "${PUSH}" == "true" && "${DRY_RUN}" == "false" ]]; then
    echo "   📤 Pushing tags to Docker Hub..."
    docker push "${IMAGE_NAME}:${VERSION}"
    docker push "${IMAGE_NAME}:${MAJOR_MINOR}"
    docker push "${IMAGE_NAME}:${MAJOR}"
    docker push "${IMAGE_NAME}:sha-${GIT_SHA}"
    docker push "${IMAGE_NAME}:latest"
    echo "   ✅ Pushed all tags for ${SERVICE}"
  fi
done

echo ""
echo "🎉 Build & tagging process completed successfully!"
if [[ "${PUSH}" != "true" ]]; then
  echo "💡 Images were built locally. To push to registry, run:"
  echo "   ./scripts/publish-docker.sh ${VERSION} --push"
fi

