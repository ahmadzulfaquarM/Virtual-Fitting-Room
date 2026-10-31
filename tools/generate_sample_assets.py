#!/usr/bin/env python3
"""Generate the Phase 2 placeholder assets: a mannequin avatar and a T-shirt garment (GLB).

These are ORIGINAL, procedurally generated meshes (no third-party content). They exist only so the
3D viewer has something real to load before AI reconstruction (Phase 4) and real garments
(Phase 5) exist. They are NOT a body scan and NOT a fit simulation.

Pure standard library. Run from the repository root:

    python3 tools/generate_sample_assets.py

Outputs (frontend/public/models/):
    avatar.glb        mannequin, 1.75 m tall, feet on y=0
    garment.glb       T-shirt in the SAME coordinate frame as the avatar (no extra transform needed)
    avatar.meta.json  ground-truth dimensions measured from the generated geometry

Conventions: metres, +Y up, the figure faces +Z, glTF 2.0, triangles with outward normals.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

N = 32  # vertices per ring

# --------------------------------------------------------------------------- vector helpers


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a):
    return math.sqrt(dot(a, a))


def norm(a):
    n = length(a)
    return (0.0, 0.0, 0.0) if n == 0 else mul(a, 1.0 / n)


def centroid(points):
    s = (0.0, 0.0, 0.0)
    for p in points:
        s = add(s, p)
    return mul(s, 1.0 / len(points))


# --------------------------------------------------------------------------- smooth profiles


def catmull_rom(p0, p1, p2, p3, t):
    return 0.5 * (
        2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3
    )


class Profile:
    """Smooth curve through control rows. Column 0 is the key (monotone), others interpolated."""

    def __init__(self, rows, per_segment):
        n = len(rows)
        dense = []
        for i in range(n - 1):
            p0, p1, p2, p3 = rows[max(i - 1, 0)], rows[i], rows[i + 1], rows[min(i + 2, n - 1)]
            for s in range(per_segment):
                t = s / per_segment
                dense.append(tuple(catmull_rom(p0[c], p1[c], p2[c], p3[c], t) for c in range(len(p1))))
        dense.append(tuple(rows[-1]))
        self.dense = dense

    def at(self, key):
        d = self.dense
        for a, b in zip(d, d[1:]):
            if (a[0] - key) * (b[0] - key) <= 0 and a[0] != b[0]:
                t = (key - a[0]) / (b[0] - a[0])
                return tuple(a[c] + (b[c] - a[c]) * t for c in range(1, len(a)))
        raise ValueError(f"key {key} outside profile range")


# --------------------------------------------------------------------------- rings


def _angles():
    return [2 * math.pi * k / N for k in range(N)]


def ring_xz(cx, y, cz, rx, rz):
    return [(cx + rx * math.cos(t), y, cz + rz * math.sin(t)) for t in _angles()]


def ring_xy(cx, cy, z, rx, ry):
    return [(cx + rx * math.cos(t), cy + ry * math.sin(t), z) for t in _angles()]


def ring_perp(c, d, ru, rv):
    ref = (0.0, 0.0, 1.0)
    if abs(dot(d, ref)) > 0.95:
        ref = (1.0, 0.0, 0.0)
    u = norm(cross(d, ref))
    v = norm(cross(d, u))
    return [add(c, add(mul(u, ru * math.cos(t)), mul(v, rv * math.sin(t)))) for t in _angles()]


def perimeter(ring):
    return sum(length(sub(ring[(k + 1) % len(ring)], ring[k])) for k in range(len(ring)))


# --------------------------------------------------------------------------- mesh


class Mesh:
    def __init__(self):
        self.pos = []
        self.idx = []

    def _tri(self, a, b, c, hint_dir):
        pa, pb, pc = self.pos[a], self.pos[b], self.pos[c]
        n = cross(sub(pb, pa), sub(pc, pa))
        if dot(n, hint_dir) < 0:
            b, c = c, b
        self.idx.extend((a, b, c))

    def add_tube(self, rings, caps=True):
        """Loft consecutive rings into a tube with outward-facing triangles."""
        n = len(rings[0])
        base = len(self.pos)
        for ring in rings:
            self.pos.extend(ring)
        centers = [centroid(r) for r in rings]
        for i in range(len(rings) - 1):
            mid = mul(add(centers[i], centers[i + 1]), 0.5)
            for k in range(n):
                k2 = (k + 1) % n
                a = base + i * n + k
                b = base + i * n + k2
                c = base + (i + 1) * n + k2
                d = base + (i + 1) * n + k
                hint = sub(centroid([self.pos[a], self.pos[b], self.pos[c], self.pos[d]]), mid)
                self._tri(a, b, c, hint)
                self._tri(a, c, d, hint)
        if caps:
            self._cap(rings[0], sub(centers[0], centers[1]))
            self._cap(rings[-1], sub(centers[-1], centers[-2]))

    def _cap(self, ring, outward):
        base = len(self.pos)
        self.pos.extend(ring)
        center_idx = len(self.pos)
        self.pos.append(centroid(ring))
        for k in range(len(ring)):
            self._tri(center_idx, base + k, base + (k + 1) % len(ring), outward)

    def normals(self):
        acc = [(0.0, 0.0, 0.0)] * len(self.pos)
        for i in range(0, len(self.idx), 3):
            a, b, c = self.idx[i : i + 3]
            fn = cross(sub(self.pos[b], self.pos[a]), sub(self.pos[c], self.pos[a]))  # area weighted
            for v in (a, b, c):
                acc[v] = add(acc[v], fn)
        return [norm(n) if length(n) > 1e-12 else (0.0, 1.0, 0.0) for n in acc]


def ellipsoid_rings(center, radii, steps=20):
    cx, cy, cz = center
    rx, ry, rz = radii
    rings = []
    for i in range(steps + 1):
        phi = math.radians(-85 + 170 * i / steps)
        s = math.cos(phi)
        rings.append(ring_xz(cx, cy + ry * math.sin(phi), cz, rx * s, rz * s))
    return rings


# --------------------------------------------------------------------------- body definition

# (y, centre_z, rx, rz): torso from pelvis to neck top
TORSO = Profile(
    [
        (0.76, 0.000, 0.060, 0.050),
        (0.80, 0.000, 0.100, 0.072),
        (0.82, 0.000, 0.125, 0.085),
        (0.88, 0.000, 0.158, 0.098),
        (0.94, -0.006, 0.168, 0.108),
        (1.02, -0.004, 0.152, 0.098),
        (1.10, 0.000, 0.134, 0.088),
        (1.20, 0.004, 0.148, 0.096),
        (1.28, 0.008, 0.163, 0.108),
        (1.36, 0.002, 0.172, 0.102),
        (1.42, -0.003, 0.182, 0.092),
        (1.46, -0.006, 0.140, 0.078),
        (1.495, -0.005, 0.080, 0.062),
        (1.52, -0.003, 0.055, 0.054),
        (1.60, 0.003, 0.050, 0.050),
    ],
    per_segment=6,
)

# (y, centre_x, centre_z, rx, rz) for the LEFT leg (+x); mirrored for the right
LEG = Profile(
    [
        (0.93, 0.092, 0.000, 0.088, 0.088),
        (0.80, 0.092, 0.000, 0.080, 0.082),
        (0.65, 0.088, 0.004, 0.064, 0.066),
        (0.50, 0.084, 0.010, 0.050, 0.054),
        (0.36, 0.080, 0.004, 0.052, 0.056),
        (0.20, 0.077, -0.002, 0.040, 0.042),
        (0.095, 0.075, -0.003, 0.032, 0.034),
        (0.075, 0.075, -0.003, 0.031, 0.033),
    ],
    per_segment=5,
)

# (z, half_height, half_width) foot; centre y == half_height so the sole sits exactly on y = 0
FOOT = Profile(
    [
        (-0.060, 0.036, 0.025),
        (-0.030, 0.036, 0.033),
        (0.030, 0.032, 0.040),
        (0.100, 0.025, 0.042),
        (0.170, 0.014, 0.034),
    ],
    per_segment=4,
)

SHOULDER_Y = 1.425
SHOULDER_X = 0.20
ARM_OUT = math.radians(18)


def arm_geometry(s):
    """Returns (list of (centre, ru, rv), upper-arm direction) for side s (+1 left, -1 right)."""
    S = (s * SHOULDER_X, SHOULDER_Y, 0.0)
    d1 = (s * math.sin(ARM_OUT), -math.cos(ARM_OUT), 0.0)
    E = add(S, mul(d1, 0.30))
    d2 = norm((s * 0.17, -0.97, 0.12))
    W = add(E, mul(d2, 0.26))
    pts = [
        (S, 0.056, 0.056),
        (add(S, mul(d1, 0.15)), 0.048, 0.048),
        (E, 0.040, 0.040),
        (add(E, mul(d2, 0.13)), 0.041, 0.041),
        (W, 0.030, 0.030),
        (add(W, mul(d2, 0.06)), 0.040, 0.017),
        (add(W, mul(d2, 0.14)), 0.036, 0.014),
        (add(W, mul(d2, 0.18)), 0.016, 0.010),
    ]
    return pts, d1, d2


def arm_rings(s):
    pts, _, d2 = arm_geometry(s)
    rows = [(*c, ru, rv) for c, ru, rv in pts]
    prof = Profile(rows, per_segment=4)
    d = prof.dense
    rings = []
    for i, row in enumerate(d):
        c = (row[0], row[1], row[2])
        nxt = d[min(i + 1, len(d) - 1)]
        prv = d[max(i - 1, 0)]
        direction = norm(sub((nxt[0], nxt[1], nxt[2]), (prv[0], prv[1], prv[2])))
        rings.append(ring_perp(c, direction, max(row[3], 0.006), max(row[4], 0.006)))
    return rings


def build_avatar():
    m = Mesh()
    m.add_tube([ring_xz(0.0, r[0], r[1], max(r[2], 0.02), max(r[3], 0.02)) for r in TORSO.dense])
    m.add_tube(ellipsoid_rings((0.0, 1.645, 0.012), (0.078, 0.1054, 0.092), steps=20))
    for s in (1, -1):
        m.add_tube(
            [ring_xz(s * r[1], r[0], r[2], r[3], r[4]) for r in LEG.dense]
        )
        m.add_tube(
            [
                ring_xy(s * 0.077, f[1], f[0], f[2], f[1])
                for f in FOOT.dense
            ]
        )
        m.add_tube(arm_rings(s))
    return m


def build_garment():
    """Crew-neck T-shirt with ~2 cm ease over the torso and short sleeves (open tubes)."""
    m = Mesh()
    ys = [0.90 + i * (1.505 - 0.90) / 40 for i in range(41)]
    rings = []
    for y in ys:
        cz, rx, rz = TORSO.at(min(y, 1.495))
        ease_x, ease_z = 0.024, 0.020
        if y > 1.44:  # shoulder slope into the collar
            rx, rz = TORSO.at(y if y <= 1.52 else 1.52)[1:3]
            ease_x = ease_z = 0.020
        if y >= 1.50:  # collar opening: wider than the neck
            rx, rz = 0.088, 0.078
            ease_x = ease_z = 0.0
        rings.append(ring_xz(0.0, y, cz, rx + ease_x, rz + ease_z))
    m.add_tube(rings, caps=False)

    for s in (1, -1):
        pts, d1, _ = arm_geometry(s)
        S = pts[0][0]
        sleeve = []
        for t, r in ((0.0, 0.076), (0.05, 0.074), (0.10, 0.070), (0.16, 0.066)):
            sleeve.append(ring_perp(add(S, mul(d1, t)), d1, r, r))
        m.add_tube(sleeve, caps=False)
    return m


# --------------------------------------------------------------------------- GLB writer


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip("#")
    return [round(srgb_to_linear(int(h[i : i + 2], 16) / 255), 5) for i in (0, 2, 4)]


def write_glb(path: Path, name: str, mesh: Mesh, material: dict, description: str):
    normals = mesh.normals()
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in mesh.pos)
    nrm_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
    wide = len(mesh.pos) > 65535
    idx_bytes = struct.pack(f"<{len(mesh.idx)}{'I' if wide else 'H'}", *mesh.idx)
    idx_bytes += b"\x00" * (-len(idx_bytes) % 4)

    mins = [min(p[i] for p in mesh.pos) for i in range(3)]
    maxs = [max(p[i] for p in mesh.pos) for i in range(3)]
    blob = pos_bytes + nrm_bytes + idx_bytes

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "tools/generate_sample_assets.py",
            "copyright": "Original procedural placeholder geometry; no third-party content.",
            "extras": {"description": description},
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0}],
        "meshes": [
            {
                "name": name,
                "primitives": [
                    {"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0, "mode": 4}
                ],
            }
        ],
        "materials": [material],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(mesh.pos), "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": 5126, "count": len(mesh.pos), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125 if wide else 5123, "count": len(mesh.idx), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(nrm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos_bytes) + len(nrm_bytes), "byteLength": len(idx_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(js), b"JSON") + js
    out += struct.pack("<I4s", len(blob), b"BIN\x00") + blob
    path.write_bytes(out)
    return {"vertices": len(mesh.pos), "triangles": len(mesh.idx) // 3, "bytes": len(out), "min": mins, "max": maxs}


def ground_truth():
    """Circumferences of the generated cross-sections (polygon perimeter of the actual ring)."""

    def girth(y):
        cz, rx, rz = TORSO.at(y)
        return round(perimeter(ring_xz(0.0, y, cz, rx, rz)), 4)

    return {
        "chestCircumferenceM": girth(1.28),
        "waistCircumferenceM": girth(1.10),
        "hipCircumferenceM": girth(0.94),
    }


def main():
    out_dir = Path(__file__).resolve().parent.parent / "frontend" / "public" / "models"
    out_dir.mkdir(parents=True, exist_ok=True)

    avatar_stats = write_glb(
        out_dir / "avatar.glb",
        "SampleMannequin",
        build_avatar(),
        {
            "name": "Mannequin",
            "pbrMetallicRoughness": {
                "baseColorFactor": [*hex_to_linear("#CBD5E1"), 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.75,
            },
        },
        "Placeholder mannequin for viewer development. Not a body scan.",
    )
    garment_stats = write_glb(
        out_dir / "garment.glb",
        "SampleTShirt",
        build_garment(),
        {
            "name": "TShirt",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [*hex_to_linear("#2563EB"), 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
        },
        "Placeholder T-shirt in the avatar's coordinate frame. Not a garment simulation.",
    )

    meta = {
        "kind": "placeholder-mannequin",
        "notScanned": True,
        "units": "m",
        "up": "+Y",
        "facing": "+Z",
        "heightM": round(avatar_stats["max"][1] - avatar_stats["min"][1], 4),
        "groundTruth": ground_truth(),
        "groundTruthMethod": "Polygon perimeter of the generated horizontal cross-section at "
        "y=1.28 (chest), 1.10 (waist), 0.94 (hips).",
        "generator": "tools/generate_sample_assets.py",
        "avatar": avatar_stats,
        "garment": garment_stats,
    }
    (out_dir / "avatar.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
