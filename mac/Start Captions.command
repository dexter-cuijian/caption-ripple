#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  print '需要 Node.js 22 或更高版本。请先从 nodejs.org 安装。'
  read -k 1
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
node scripts/download-model.mjs paraformer
print '保持此窗口开启；按 Control+C 停止伴侣程序。'
exec node server/index.mjs
