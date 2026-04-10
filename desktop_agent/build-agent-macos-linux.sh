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
scale = 4
work = size * scale
bg = (236, 72, 153)
bg_hi = (249, 96, 170)
fg = (255, 255, 255)
shadow = (194, 24, 111)
tile_margin = int(112 * scale)
tile_radius = int(228 * scale)
tile_left = tile_margin
tile_top = tile_margin
tile_right = work - tile_margin
tile_bottom = work - tile_margin
stroke = int(92 * scale)
left_x = int(284 * scale)
right_x = int(748 * scale)
top_y = int(258 * scale)
bottom_y = int(766 * scale)
shadow_dx = int(18 * scale)
shadow_dy = int(18 * scale)


def inside_round_rect(x, y, left, top, right, bottom, radius):
    if left + radius <= x <= right - radius or top + radius <= y <= bottom - radius:
        return True
    cx = left + radius if x < left + radius else right - radius
    cy = top + radius if y < top + radius else bottom - radius
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= radius * radius


def dist_to_segment(px, py, ax, ay, bx, by):
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    denom = abx * abx + aby * aby
    if denom <= 0:
        dx = px - ax
        dy = py - ay
        return (dx * dx + dy * dy) ** 0.5
    t = (apx * abx + apy * aby) / denom
    if t < 0:
        t = 0
    elif t > 1:
        t = 1
    cx = ax + t * abx
    cy = ay + t * aby
    dx = px - cx
    dy = py - cy
    return (dx * dx + dy * dy) ** 0.5


def inside_stroke(px, py, ax, ay, bx, by, width):
    return dist_to_segment(px, py, ax, ay, bx, by) <= width / 2.0


def blend(base, top, alpha):
    inv = 1.0 - alpha
    return (
        int(base[0] * inv + top[0] * alpha),
        int(base[1] * inv + top[1] * alpha),
        int(base[2] * inv + top[2] * alpha),
    )


work_pixels = []
for y in range(work):
    row = []
    for x in range(work):
        color = (255, 255, 255)
        if inside_round_rect(x, y, tile_left, tile_top, tile_right, tile_bottom, tile_radius):
            color = bg_hi if y < (tile_top + tile_bottom) / 2 else bg
            if inside_round_rect(
                x - shadow_dx,
                y - shadow_dy,
                tile_left,
                tile_top,
                tile_right,
                tile_bottom,
                tile_radius,
            ):
                color = blend(color, shadow, 0.12)
        if (
            inside_stroke(x, y, left_x, top_y, left_x, bottom_y, stroke)
            or inside_stroke(x, y, right_x, top_y, right_x, bottom_y, stroke)
            or inside_stroke(x, y, left_x, top_y, right_x, bottom_y, stroke)
        ):
            color = fg
        row.append(color)
    work_pixels.append(row)

pixels = bytearray()
for y in range(size):
    for x in range(size):
        total_r = total_g = total_b = 0
        for sy in range(scale):
            for sx in range(scale):
                r, g, b = work_pixels[y * scale + sy][x * scale + sx]
                total_r += r
                total_g += g
                total_b += b
        count = scale * scale
        pixels.extend((
            total_r // count,
            total_g // count,
            total_b // count,
        ))

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
