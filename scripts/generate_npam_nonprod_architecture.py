#!/usr/bin/env python3
"""
Generate NPAM non-prod architecture diagram as JPEG without external image libraries.
Writes:
  docs/npam_nonprod_architecture.ppm
  docs/npam_nonprod_architecture.jpg
"""
from __future__ import annotations

import os
import subprocess

W = 2200
H = 1300

BG = (245, 248, 252)
BLACK = (26, 34, 46)
WHITE = (255, 255, 255)
BLUE = (33, 103, 198)
LIGHT_BLUE = (220, 235, 255)
GREEN = (34, 139, 34)
LIGHT_GREEN = (223, 245, 223)
ORANGE = (194, 105, 0)
LIGHT_ORANGE = (255, 238, 215)
GRAY = (95, 109, 128)

# 5x7 uppercase pixel font
FONT = {
    ' ': ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    '-': ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    '.': ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ':': ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    '0': ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    '1': ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    '2': ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    '3': ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    '4': ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    '5': ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    '6': ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    '7': ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    '8': ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    '9': ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    'C': ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    'D': ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    'G': ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
    'H': ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    'I': ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    'J': ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'M': ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    'Q': ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    'S': ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    'U': ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    'V': ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    'W': ["10001", "10001", "10001", "10001", "10101", "11011", "10001"],
    'X': ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    'Z': ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
}


def canvas(w: int, h: int, bg):
    return [[bg for _ in range(w)] for _ in range(h)]


def set_px(img, x, y, color):
    if 0 <= x < W and 0 <= y < H:
        img[y][x] = color


def fill_rect(img, x, y, w, h, color):
    x2, y2 = x + w, y + h
    for yy in range(max(0, y), min(H, y2)):
        row = img[yy]
        for xx in range(max(0, x), min(W, x2)):
            row[xx] = color


def draw_rect(img, x, y, w, h, border, thickness=3):
    fill_rect(img, x, y, w, thickness, border)
    fill_rect(img, x, y + h - thickness, w, thickness, border)
    fill_rect(img, x, y, thickness, h, border)
    fill_rect(img, x + w - thickness, y, thickness, h, border)


def draw_line(img, x1, y1, x2, y2, color, thickness=2):
    dx = abs(x2 - x1)
    sx = 1 if x1 < x2 else -1
    dy = -abs(y2 - y1)
    sy = 1 if y1 < y2 else -1
    err = dx + dy
    while True:
        fill_rect(img, x1 - thickness // 2, y1 - thickness // 2, thickness, thickness, color)
        if x1 == x2 and y1 == y2:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x1 += sx
        if e2 <= dx:
            err += dx
            y1 += sy


def draw_arrow(img, x1, y1, x2, y2, color, thickness=3):
    draw_line(img, x1, y1, x2, y2, color, thickness)
    # simple arrow head
    if abs(x2 - x1) >= abs(y2 - y1):
        direction = 1 if x2 >= x1 else -1
        draw_line(img, x2, y2, x2 - 18 * direction, y2 - 10, color, thickness)
        draw_line(img, x2, y2, x2 - 18 * direction, y2 + 10, color, thickness)
    else:
        direction = 1 if y2 >= y1 else -1
        draw_line(img, x2, y2, x2 - 10, y2 - 18 * direction, color, thickness)
        draw_line(img, x2, y2, x2 + 10, y2 - 18 * direction, color, thickness)


def draw_char(img, ch, x, y, scale, color):
    glyph = FONT.get(ch.upper(), FONT[' '])
    for row_i, row in enumerate(glyph):
        for col_i, bit in enumerate(row):
            if bit == '1':
                fill_rect(img, x + col_i * scale, y + row_i * scale, scale, scale, color)


def draw_text(img, text, x, y, scale=3, color=BLACK, spacing=1):
    cursor = x
    for ch in text:
        draw_char(img, ch, cursor, y, scale, color)
        cursor += (5 + spacing) * scale


def text_width(text, scale=3, spacing=1):
    return len(text) * (5 + spacing) * scale


def draw_center_text(img, text, cx, y, scale=3, color=BLACK):
    tw = text_width(text, scale=scale)
    draw_text(img, text, cx - tw // 2, y, scale=scale, color=color)


def draw_box_with_title(img, x, y, w, h, title, body_lines, fill_color, border_color):
    fill_rect(img, x, y, w, h, fill_color)
    draw_rect(img, x, y, w, h, border_color, thickness=4)
    draw_center_text(img, title, x + w // 2, y + 16, scale=3, color=border_color)
    yy = y + 58
    for line in body_lines:
        draw_center_text(img, line, x + w // 2, yy, scale=2, color=BLACK)
        yy += 22


def save_ppm(img, out_ppm):
    with open(out_ppm, 'w', encoding='ascii') as f:
        f.write(f"P3\n{W} {H}\n255\n")
        for row in img:
            f.write(' '.join(f"{r} {g} {b}" for (r, g, b) in row))
            f.write('\n')


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    docs_dir = os.path.join(root, 'docs')
    os.makedirs(docs_dir, exist_ok=True)

    out_ppm = os.path.join(docs_dir, 'npam_nonprod_architecture.ppm')
    out_jpg = os.path.join(docs_dir, 'npam_nonprod_architecture.jpg')

    img = canvas(W, H, BG)

    # Title
    draw_center_text(img, 'NPAM NON PROD TARGET ARCHITECTURE', W // 2, 30, scale=4, color=BLUE)
    draw_center_text(img, 'SEPARATED APP ADMIN PATHS  PRIVATE PROXY  VAULT  IDC INTEGRATION', W // 2, 82, scale=2, color=GRAY)

    # Top actors
    draw_box_with_title(
        img, 70, 170, 290, 140,
        'END USERS',
        ['EMPLOYEE', 'APPROVER', 'ADMIN'],
        WHITE, BLUE
    )

    draw_box_with_title(
        img, 420, 170, 430, 170,
        'PAM APP EC2 MEMBER ACCOUNT',
        ['FRONTEND UI', 'FLASK API', 'ROUTES  APP AND ADMIN', 'AUDIT AND APPROVAL ENGINE'],
        LIGHT_BLUE, BLUE
    )

    draw_box_with_title(
        img, 920, 120, 530, 250,
        'MANAGEMENT ACCOUNT IAM IDENTITY CENTER',
        ['IDENTITY STORE USERS GROUPS', 'PERMISSION SET CREATE UPDATE DELETE', 'ACCOUNT ASSIGNMENT CREATE DELETE', 'ORGANIZATION TREE LIST ROOTS OUS ACCOUNTS'],
        LIGHT_ORANGE, ORANGE
    )

    # Dedicated DB access VPC area
    fill_rect(img, 150, 430, 1900, 760, (236, 245, 236))
    draw_rect(img, 150, 430, 1900, 760, GREEN, thickness=5)
    draw_center_text(img, 'DEDICATED DB ACCESS VPC  MEMBER ACCOUNT', 1100, 450, scale=3, color=GREEN)

    draw_box_with_title(
        img, 250, 520, 500, 280,
        'PRIVATE SUBNET A',
        ['EC2 VAULT', 'APPROLE AUTH', 'DYNAMIC DB USER', 'LEASE REVOKE'],
        WHITE, GREEN
    )

    draw_box_with_title(
        img, 840, 520, 500, 280,
        'PRIVATE SUBNET B',
        ['EC2 DB PROXY', 'ONLY INTERNAL DNS', 'SQL POLICY ENFORCEMENT', 'NO PUBLIC INBOUND'],
        WHITE, GREEN
    )

    draw_box_with_title(
        img, 1420, 520, 560, 220,
        'PRIVATE ROUTE53 ZONE',
        ['DBPROXY NPAM INTERNAL', 'VAULT NPAM INTERNAL', 'VPC DNS ONLY'],
        WHITE, GREEN
    )

    draw_box_with_title(
        img, 1420, 790, 560, 300,
        'TARGET RDS IN MEMBER ACCOUNTS',
        ['TAG CHECK  DATA CLASSIFICATION', 'IAM DB CONNECT OR VAULT USER', 'ALLOW ONLY APPROVED DB', 'REMOVE ACCESS ON REVOKE OR EXPIRY'],
        WHITE, GREEN
    )

    # Arrows and flows
    draw_arrow(img, 360, 240, 420, 240, BLUE, 4)  # users -> app
    draw_arrow(img, 850, 240, 920, 240, ORANGE, 4)  # app -> mgmt
    draw_arrow(img, 650, 340, 650, 520, GREEN, 4)  # app -> vault
    draw_arrow(img, 700, 680, 840, 680, GREEN, 4)  # vault -> proxy
    draw_arrow(img, 1340, 650, 1420, 650, GREEN, 4)  # proxy -> route53
    draw_arrow(img, 1340, 760, 1420, 910, GREEN, 4)  # proxy -> rds
    draw_arrow(img, 1700, 740, 1110, 805, GREEN, 4)  # route53 -> proxy

    # Side notes
    draw_box_with_title(
        img, 70, 860, 1170, 290,
        'NON PROD EC2 SIZING',
        [
            'RECOMMENDED 3 EC2  PAM APP  VAULT  DB PROXY',
            'MINIMUM 2 EC2  PAM APP  COMBINED VAULT PLUS PROXY',
            'PRIVATE SUBNETS FOR VAULT AND PROXY ONLY',
            'SG RULES  APP TO VAULT  APP TO PROXY  PROXY TO RDS ONLY'
        ],
        WHITE, BLUE
    )

    draw_box_with_title(
        img, 1280, 170, 700, 260,
        'CROSS ACCOUNT TRUST',
        ['PAM EC2 ROLE IN MEMBER ACCOUNT', 'STS ASSUME ROLE INTO MGMT IDC ROLE', 'NO LONG LIVED AWS KEYS ON EC2'],
        WHITE, ORANGE
    )

    save_ppm(img, out_ppm)

    # Convert PPM -> JPEG using ffmpeg (available in this environment)
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error', '-i', out_ppm, out_jpg
    ], check=True)

    print(out_jpg)


if __name__ == '__main__':
    main()
