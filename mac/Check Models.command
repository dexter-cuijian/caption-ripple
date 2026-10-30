#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/download-model.mjs paraformer
print '原文识别模型已校验。可选翻译模型：node scripts/download-model.mjs hy-mt2'
read -k 1
