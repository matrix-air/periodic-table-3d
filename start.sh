#!/bin/bash
# 元素周期表·三维重建 一键启动
cd "$(dirname "$0")" || exit 1
PORT="${1:-8930}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✅ 已在服务中: http://127.0.0.1:$PORT"
else
  nohup python3 -m http.server "$PORT" > /tmp/periodic-table-3d-server.log 2>&1 &
  sleep 1
  echo "✅ 已启动: http://127.0.0.1:$PORT （日志 /tmp/periodic-table-3d-server.log）"
fi
