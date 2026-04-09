#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${ROOT_DIR}/desktop_agent"
OUT_DIR="${ROOT_DIR}/desktop_agent/dist-artifacts"
PYTHON_BIN="${PYTHON_BIN:-python3}"
OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_NAME="$(uname -m)"
BIN_NAME="npamx-agent"
APP_NAME="NPAMX"
BUILD_ICONSET_DIR="${ROOT_DIR}/build/npamx.iconset"
BUILD_ICON_PPM="${ROOT_DIR}/build/npamx-agent-icon.ppm"
BUILD_ICON_PNG="${ROOT_DIR}/build/npamx-agent-icon.png"
BUILD_ICON_ICNS="${ROOT_DIR}/build/npamx-agent.icns"

cd "${ROOT_DIR}"
rm -rf .venv-agent-build dist build "${ROOT_DIR}/npamx-agent.spec"
mkdir -p "${OUT_DIR}"
rm -rf "${OUT_DIR}/${APP_NAME}.app"
rm -f "${OUT_DIR}"/npamx-agent-* "${OUT_DIR}"/NPAMX-*
"${PYTHON_BIN}" -m venv .venv-agent-build
source .venv-agent-build/bin/activate
python -m pip install --upgrade pip
python -m pip install -r "${AGENT_DIR}/requirements-build.txt"
python - <<'PY'
import sys
try:
    import tkinter  # noqa: F401
except Exception as exc:
    raise SystemExit(
        "Tkinter is not available in this Python build. "
        "Use a Python installation with Tk support before packaging the desktop UI agent. "
        f"Current error: {exc}"
    )
print("Tkinter check passed.")
PY

if [[ "${OS_NAME}" == "darwin" ]]; then
  mkdir -p "${BUILD_ICONSET_DIR}"
  ROOT_DIR="${ROOT_DIR}" python - <<'PY'
import os
from pathlib import Path

size = 1024
bg = (17, 43, 92)
fg = (255, 255, 255)
pad = 80
pixels = bytearray()

for y in range(size):
    for x in range(size):
        color = bg
        if pad <= x < pad + 110 and 180 <= y < 844:
            color = fg
        elif 834 <= x < 944 and 180 <= y < 844:
            color = fg
        elif 0 <= (x - (pad + 110)) <= 600:
            diag = x - (pad + 110)
            y_top = 180 + diag
            if y_top - 55 <= y <= y_top + 55 and x < 834:
                color = fg
        pixels.extend(color)

root_dir = Path(os.environ["ROOT_DIR"])
out = root_dir / "build" / "npamx-agent-icon.ppm"
out.parent.mkdir(parents=True, exist_ok=True)
with out.open("wb") as f:
    f.write(f"P6\n{size} {size}\n255\n".encode("ascii"))
    f.write(pixels)
PY
  sips -s format png "${BUILD_ICON_PPM}" --out "${BUILD_ICON_PNG}" >/dev/null
  for size in 16 32 128 256 512; do
    sips -z "${size}" "${size}" "${BUILD_ICON_PNG}" --out "${BUILD_ICONSET_DIR}/icon_${size}x${size}.png" >/dev/null
    doubled=$((size * 2))
    sips -z "${doubled}" "${doubled}" "${BUILD_ICON_PNG}" --out "${BUILD_ICONSET_DIR}/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "${BUILD_ICONSET_DIR}" -o "${BUILD_ICON_ICNS}"

  pyinstaller \
    --clean \
    --noconfirm \
    --windowed \
    --name "${APP_NAME}" \
    --icon "${BUILD_ICON_ICNS}" \
    --osx-bundle-identifier com.nykaa.npamx.desktop-agent \
    "${AGENT_DIR}/npamx_agent.py"
else
  pyinstaller \
    --clean \
    --noconfirm \
    --onefile \
    --name "${BIN_NAME}" \
    "${AGENT_DIR}/npamx_agent.py"
fi

mkdir -p "${OUT_DIR}"
if [[ "${OS_NAME}" == "darwin" && -d "${ROOT_DIR}/dist/${APP_NAME}.app" ]]; then
  cp -R "${ROOT_DIR}/dist/${APP_NAME}.app" "${OUT_DIR}/${APP_NAME}.app"
  pushd "${OUT_DIR}" >/dev/null
  ditto -c -k --keepParent "${APP_NAME}.app" "${APP_NAME}-${OS_NAME}-${ARCH_NAME}.zip"
  popd >/dev/null
else
  cp -f "${ROOT_DIR}/dist/${BIN_NAME}" "${OUT_DIR}/${BIN_NAME}-${OS_NAME}-${ARCH_NAME}"
  pushd "${OUT_DIR}" >/dev/null
  tar -czf "${BIN_NAME}-${OS_NAME}-${ARCH_NAME}.tar.gz" "${BIN_NAME}-${OS_NAME}-${ARCH_NAME}"
  popd >/dev/null
fi

echo "Build complete. Artifacts in: ${OUT_DIR}"
