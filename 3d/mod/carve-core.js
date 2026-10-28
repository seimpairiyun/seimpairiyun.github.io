/* ==================================================================
   CARVE CORE — rekonstruksi 3D dari beberapa foto (visual hull), fungsi murni.
   ------------------------------------------------------------------
   Pipeline:
   1. prepareView()   : alpha → siluet (komponen terbesar) → signed distance (px)
   2. calibrate()     : tentukan skala & titik pusat tiap foto (kamera ortografik)
   3. buildField()    : f(x,y,z) = min tiap view (signed distance siluet / skala)
                        → permukaan di f = 0 (halus, bukan voxel kotak-kotak)
   4. surfaceNets()   : ekstraksi mesh dari field
   5. computeNormals(), colorVertices() : normal + warna vertex dari foto

   Konvensi koordinat (objek menghadap +Z, Y ke atas):
   - azimuth 0 = kamera di depan (+Z), 90 = kamera di sisi KIRI objek (+X),
     -90 = sisi KANAN objek (-X), 180 = belakang.
   - elevation +90 = dari atas (bagian depan objek ada di BAWAH gambar),
     -90 = dari bawah (bagian depan objek ada di ATAS gambar).
   ================================================================== */

import { distanceTransform } from './mesh-core.js?v=3';

const DEG = Math.PI / 180;

export const VIEW_PRESETS = {
    front: { label: 'Depan', azimuth: 0, elevation: 0 },
    right: { label: 'Kanan (sisi kanan objek)', azimuth: -90, elevation: 0 },
    back: { label: 'Belakang', azimuth: 180, elevation: 0 },
    left: { label: 'Kiri (sisi kiri objek)', azimuth: 90, elevation: 0 },
    top: { label: 'Atas', azimuth: 0, elevation: 90 },
    bottom: { label: 'Bawah', azimuth: 0, elevation: -90 },
};

const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** Basis kamera ortografik: d = arah ke kamera, r = kanan gambar, u = atas gambar. */
export function cameraBasis(azimuthDeg, elevationDeg) {
    const th = azimuthDeg * DEG;
    const ph = elevationDeg * DEG;
    const cp = Math.cos(ph);
    const d = [Math.sin(th) * cp, Math.sin(ph), Math.cos(th) * cp];
    const r = [Math.cos(th), 0, -Math.sin(th)];
    const f = [-d[0], -d[1], -d[2]];
    const u = cross(r, f);
    return { d, r, u };
}

/* ---------- siluet ---------- */

/** Pertahankan hanya komponen terhubung terbesar (buang bintik noise). */
export function keepLargestComponent(mask, w, h) {
    const n = w * h;
    const label = new Int32Array(n);
    const queue = new Int32Array(n);
    let best = 0;
    let bestId = 0;
    let id = 0;

    for (let s = 0; s < n; s++) {
        if (!mask[s] || label[s]) continue;
        id++;
        let head = 0;
        let tail = 0;
        queue[tail++] = s;
        label[s] = id;
        while (head < tail) {
            const p = queue[head++];
            const x = p % w;
            const y = (p - x) / w;
            const tryP = (q) => {
                if (mask[q] && !label[q]) {
                    label[q] = id;
                    queue[tail++] = q;
                }
            };
            if (x > 0) tryP(p - 1);
            if (x < w - 1) tryP(p + 1);
            if (y > 0) tryP(p - w);
            if (y < h - 1) tryP(p + w);
        }
        if (tail > best) {
            best = tail;
            bestId = id;
        }
    }

    const out = new Uint8Array(n);
    if (bestId) for (let i = 0; i < n; i++) out[i] = label[i] === bestId ? 1 : 0;
    return out;
}

/** Signed distance dalam piksel: + di dalam siluet, − di luar. */
export function signedDistance(mask, w, h) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
    const din = distanceTransform(mask, w, h); // tepi gambar = luar
    const dout = distanceTransform(inv, w, h, 1e9); // tepi gambar diabaikan
    const sd = new Float32Array(w * h);
    for (let i = 0; i < sd.length; i++) {
        sd[i] = mask[i] ? din[i] - 0.5 : -(dout[i] - 0.5);
    }
    return sd;
}

/** Siapkan satu foto: rgba harus sudah ber-alpha (background dihapus). */
export function prepareView({ rgba, width, height, azimuth, elevation, alphaCut = 128 }) {
    const n = width * height;
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = rgba[i * 4 + 3] >= alphaCut ? 1 : 0;
    mask = keepLargestComponent(mask, width, height);

    let minX = width, maxX = -1, minY = height, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) throw new Error('Objek tidak terdeteksi pada salah satu foto.');

    return {
        azimuth,
        elevation,
        width,
        height,
        rgba,
        mask,
        sd: signedDistance(mask, width, height),
        bbox: { minX, maxX: maxX + 1, minY, maxY: maxY + 1 },
        basis: cameraBasis(azimuth, elevation),
        scale: 1,
        cx: width / 2,
        cy: height / 2,
    };
}

/* ---------- kalibrasi ----------
   Asumsi: kamera ortografik, objek kira-kira di tengah foto.
   - Foto "horizontal" (|elevasi| < 45°): tinggi objek di semua foto = 1 unit.
   - Foto atas/bawah: lebar siluet disamakan dengan lebar objek dari foto horizontal
     yang sumbu horizontalnya sejajar.
   adjustments[i] = { scale: 1, dx: 0, dy: 0 }  (dx, dy = fraksi lebar/tinggi gambar)
   Return: { half } = setengah sisi kubus grid. */
export function calibrate(views, adjustments = []) {
    const horiz = views.filter((v) => Math.abs(v.elevation) < 45);
    const vert = views.filter((v) => Math.abs(v.elevation) >= 45);
    const bw = (v) => v.bbox.maxX - v.bbox.minX;
    const bh = (v) => v.bbox.maxY - v.bbox.minY;

    for (const v of horiz) {
        v.scale = bh(v);
        v.cx = (v.bbox.minX + v.bbox.maxX) / 2;
        v.cy = (v.bbox.minY + v.bbox.maxY) / 2;
    }

    for (const v of vert) {
        let extent = null;
        const parallel = horiz.filter(
            (h) => Math.abs(h.basis.r[0] * v.basis.r[0] + h.basis.r[2] * v.basis.r[2]) > 0.7
        );
        const pool = parallel.length ? parallel : horiz;
        if (pool.length) {
            extent = pool.reduce((s, h) => s + bw(h) / h.scale, 0) / pool.length;
        }
        v.scale = extent ? bw(v) / extent : Math.max(bw(v), bh(v));
        v.cx = (v.bbox.minX + v.bbox.maxX) / 2;
        v.cy = (v.bbox.minY + v.bbox.maxY) / 2;
    }

    views.forEach((v, i) => {
        const a = adjustments[i] ?? {};
        v.scale *= a.scale ?? 1;
        v.cx += (a.dx ?? 0) * v.width;
        v.cy += (a.dy ?? 0) * v.height;
    });

    let maxExt = 1;
    for (const v of views) {
        maxExt = Math.max(maxExt, bw(v) / v.scale, bh(v) / v.scale);
    }
    return { half: maxExt * 0.5 * 1.1 };
}

/** Proyeksi titik dunia → koordinat piksel (ortografik). */
export function project(v, x, y, z) {
    const { r, u } = v.basis;
    return [
        v.cx + (x * r[0] + y * r[1] + z * r[2]) * v.scale,
        v.cy - (x * u[0] + y * u[1] + z * u[2]) * v.scale,
    ];
}

/** Bilinear sample Float32Array 1 channel; di luar gambar → nilai tepi dikurangi overshoot. */
function sampleSD(sd, w, h, px, py) {
    let over = 0;
    let x = px;
    let y = py;
    if (x < 0) { over += -x; x = 0; }
    if (x > w - 1) { over += x - (w - 1); x = w - 1; }
    if (y < 0) { over += -y; y = 0; }
    if (y > h - 1) { over += y - (h - 1); y = h - 1; }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const top = sd[y0 * w + x0] * (1 - tx) + sd[y0 * w + x1] * tx;
    const bot = sd[y1 * w + x0] * (1 - tx) + sd[y1 * w + x1] * tx;
    const val = top * (1 - ty) + bot * ty;
    return over > 0 ? Math.min(val, -1) - over : val;
}

/* ---------- field ----------
   Return { field, n, origin, step }. n = jumlah sampel per sumbu (res + 1).
   biasPx: >0 menggemukkan siluet (toleransi ketidaksejajaran), <0 mengurusi. */
export async function buildField(views, { res = 96, half, biasPx = 1, onProgress } = {}) {
    const n = res + 1;
    const step = (2 * half) / res;
    const origin = -half;
    const field = new Float32Array(n * n * n).fill(1e9);

    for (let vi = 0; vi < views.length; vi++) {
        const v = views[vi];
        const { r, u } = v.basis;
        const sc = v.scale;

        for (let z = 0; z < n; z++) {
            const Z = origin + z * step;
            for (let y = 0; y < n; y++) {
                const Y = origin + y * step;
                const base = n * (y + n * z);
                for (let x = 0; x < n; x++) {
                    const X = origin + x * step;
                    const px = v.cx + (X * r[0] + Y * r[1] + Z * r[2]) * sc;
                    const py = v.cy - (X * u[0] + Y * u[1] + Z * u[2]) * sc;
                    const val = (sampleSD(v.sd, v.width, v.height, px, py) + biasPx) / sc;
                    const idx = base + x;
                    if (val < field[idx]) field[idx] = val;
                }
            }
        }
        onProgress?.((vi + 1) / views.length);
        await new Promise((res2) => setTimeout(res2, 0)); // beri napas ke UI
    }

    // Pastikan lapisan terluar negatif → permukaan selalu tertutup
    const eps = -1e-4;
    for (let z = 0; z < n; z++) {
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (x === 0 || y === 0 || z === 0 || x === n - 1 || y === n - 1 || z === n - 1) {
                    const idx = x + n * (y + n * z);
                    if (field[idx] > eps) field[idx] = eps;
                }
            }
        }
    }
    return { field, n, origin, step };
}

/* ---------- Naive Surface Nets ---------- */
export function surfaceNets({ field, n, origin, step }) {
    const cn = n - 1;
    const vIndex = new Int32Array(cn * cn * cn).fill(-1);
    const positions = [];
    const sIdx = (x, y, z) => x + n * (y + n * z);
    const cIdx = (x, y, z) => x + cn * (y + cn * z);

    // 12 sisi kubus: pasangan sudut (bit0=x, bit1=y, bit2=z)
    const EDGES = [];
    for (let k = 0; k < 8; k++) {
        for (const bit of [1, 2, 4]) {
            if (!(k & bit)) EDGES.push([k, k | bit]);
        }
    }
    const vals = new Float32Array(8);

    for (let z = 0; z < cn; z++) {
        for (let y = 0; y < cn; y++) {
            for (let x = 0; x < cn; x++) {
                let mask = 0;
                for (let k = 0; k < 8; k++) {
                    const v = field[sIdx(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1))];
                    vals[k] = v;
                    if (v > 0) mask |= 1 << k;
                }
                if (mask === 0 || mask === 255) continue;

                let sx = 0, sy = 0, sz = 0, cnt = 0;
                for (const [a, b] of EDGES) {
                    const ia = vals[a] > 0;
                    const ib = vals[b] > 0;
                    if (ia === ib) continue;
                    const t = vals[a] / (vals[a] - vals[b]);
                    sx += (a & 1) + t * ((b & 1) - (a & 1));
                    sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
                    sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
                    cnt++;
                }
                vIndex[cIdx(x, y, z)] = positions.length / 3;
                positions.push(
                    origin + (x + sx / cnt) * step,
                    origin + (y + sy / cnt) * step,
                    origin + (z + sz / cnt) * step
                );
            }
        }
    }

    const indices = [];
    const p = [0, 0, 0];
    for (let z = 0; z < n; z++) {
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                p[0] = x; p[1] = y; p[2] = z;
                const inside0 = field[sIdx(x, y, z)] > 0;

                for (let a = 0; a < 3; a++) {
                    if (p[a] >= n - 1) continue;
                    const u = (a + 1) % 3;
                    const v = (a + 2) % 3;
                    if (p[u] < 1 || p[v] < 1 || p[u] >= n - 1 || p[v] >= n - 1) continue;

                    const q = [x, y, z];
                    q[a]++;
                    if (inside0 === field[sIdx(q[0], q[1], q[2])] > 0) continue;

                    const cell = (du, dv) => {
                        const c = [x, y, z];
                        c[u] -= du;
                        c[v] -= dv;
                        return vIndex[cIdx(c[0], c[1], c[2])];
                    };
                    const A = cell(1, 1);
                    const B = cell(0, 1);
                    const C = cell(0, 0);
                    const D = cell(1, 0);
                    if (A < 0 || B < 0 || C < 0 || D < 0) continue;

                    if (inside0) indices.push(A, B, C, A, C, D);
                    else indices.push(A, C, B, A, D, C);
                }
            }
        }
    }

    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Normal vertex (area-weighted). */
export function computeNormals(positions, indices) {
    const nrm = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
        const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        for (const k of [a, b, c]) {
            nrm[k] += nx;
            nrm[k + 1] += ny;
            nrm[k + 2] += nz;
        }
    }
    for (let i = 0; i < nrm.length; i += 3) {
        const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
        nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
    }
    return nrm;
}

/* ---------- Warna vertex dari foto ----------
   Bobot tiap foto = (menghadap kamera)^sharpness × (jauh dari tepi siluet).
   Return Float32Array RGB 0..1 (sRGB). */
export function colorVertices(positions, normals, views, { sharpness = 4, edgePx = 6 } = {}) {
    const count = positions.length / 3;
    const colors = new Float32Array(count * 3);

    const sampleRGB = (v, px, py) => {
        const x = Math.min(v.width - 1, Math.max(0, Math.round(px)));
        const y = Math.min(v.height - 1, Math.max(0, Math.round(py)));
        const i = (y * v.width + x) * 4;
        return [v.rgba[i], v.rgba[i + 1], v.rgba[i + 2]];
    };

    for (let i = 0; i < count; i++) {
        const X = positions[i * 3], Y = positions[i * 3 + 1], Z = positions[i * 3 + 2];
        const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];

        let r = 0, g = 0, b = 0, wsum = 0;
        let fr = 0, fg = 0, fb = 0, bestFacing = 0.02; // cadangan: view paling menghadap

        for (const v of views) {
            const facing = nx * v.basis.d[0] + ny * v.basis.d[1] + nz * v.basis.d[2];
            if (facing <= 0.02) continue;
            const [px, py] = project(v, X, Y, Z);
            if (px < 0 || py < 0 || px > v.width - 1 || py > v.height - 1) continue;

            const [cr, cg, cb] = sampleRGB(v, px, py);
            if (facing > bestFacing) {
                bestFacing = facing;
                fr = cr; fg = cg; fb = cb;
            }
            const sd = sampleSD(v.sd, v.width, v.height, px, py);
            const edge = Math.min(1, Math.max(0, sd / edgePx));
            const w = Math.pow(facing, sharpness) * edge;
            if (w <= 0) continue;
            r += cr * w; g += cg * w; b += cb * w; wsum += w;
        }

        if (wsum > 0) {
            colors[i * 3] = r / wsum / 255;
            colors[i * 3 + 1] = g / wsum / 255;
            colors[i * 3 + 2] = b / wsum / 255;
        } else if (bestFacing > 0.02) {
            colors[i * 3] = fr / 255;
            colors[i * 3 + 1] = fg / 255;
            colors[i * 3 + 2] = fb / 255;
        } else {
            colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0.6;
        }
    }
    return colors;
}

/** Pipeline lengkap (dipakai UI & tes). */
export async function carve(views, { res = 96, biasPx = 1, adjustments = [], onProgress } = {}) {
    const { half } = calibrate(views, adjustments);
    const grid = await buildField(views, { res, half, biasPx, onProgress });
    const { positions, indices } = surfaceNets(grid);
    const normals = computeNormals(positions, indices);
    const colors = colorVertices(positions, normals, views);
    return { positions, indices, normals, colors, half };
}
