#!/usr/bin/env bash
# Install a pinned actionlint into ./.tools/bin and verify its SHA-256 before unpacking.
# Usage: pipeline/install-actionlint.sh   (Linux amd64 or arm64; on a Mac use `brew install actionlint`)
set -euo pipefail

VERSION="1.7.12"
declare -A SUMS=(
  [linux_amd64]="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
  [linux_arm64]="325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6"
)

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform="linux_amd64" ;;
  Linux-aarch64) platform="linux_arm64" ;;
  *) echo "install-actionlint: unsupported platform $(uname -sm); install actionlint $VERSION yourself" >&2; exit 1 ;;
esac

dest="${TOOLS_DIR:-.tools}/bin"
mkdir -p "$dest"
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_${platform}.tar.gz" -o "$archive"
echo "${SUMS[$platform]}  $archive" | sha256sum --check --status || { echo "install-actionlint: checksum mismatch" >&2; exit 1; }
tar -xzf "$archive" -C "$dest" actionlint
echo "installed actionlint ${VERSION} to $dest/actionlint"
