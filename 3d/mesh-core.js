/* ==================================================================
   MESH CORE — fungsi murni (tanpa DOM / THREE) sehingga mudah dites.
   - computeDepth():       depth map dari alpha mask + luminance
   - buildGeometryData():  grid mesh (+ opsional back face & dinding "solid")
   ================================================================== */

const SQRT2 = Math.SQRT2;

/* ---------- Box blur separable (cepat, O(n·r)) ---------- */
export function boxBlur(src, w, h, r, passes = 1) {
    let a = src;
    for (let p = 0; p < passes; p++) {
        const tmp = new Float32Array(w * h);
        const out = new Float32Array(w * h);

        // horizontal
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const x0 = Math.max(0, x - r);
                const x1 = Math.min(w - 1, x + r);
                let sum = 0;
                for (let k = x0; k <= x1; k++) sum += a[row + k];
                tmp[row + x] = sum / (x1 - x0 + 1);
            }
        }
        // vertical
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                const y0 = Math.max(0, y - r);
                const y1 = Math.min(h - 1, y + r);
                let sum = 0;
                for (let k = y0; k <= y1; k++) sum += tmp[k * w + x];
                out[y * w + x] = sum / (y1 - y0 + 1);
            }
        }
        a = out;
    }
    return a;
}

/* ---------- Distance transform (chamfer 2-pass) ----------
   Jarak tiap piksel "di dalam" objek ke piksel luar terdekat. */
export function distanceTransform(inside, w, h) {
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0;

    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (d[i] === 0) continue;
            d[i] = Math.min(
                d[i],
                at(x - 1, y) + 1,
                at(x, y - 1) + 1,
                at(x - 1, y - 1) + SQRT2,
                at(x + 1, y - 1) + SQRT2
            );
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (d[i] === 0) continue;
            d[i] = Math.min(
                d[i],
                at(x + 1, y) + 1,
                at(x, y + 1) + 1,
                at(x + 1, y + 1) + SQRT2,
                at(x - 1, y + 1) + SQRT2
            );
        }
    }
    return d;
}

/* ---------- Depth map ----------
   Kombinasi:
   1. "Dome"  : makin jauh dari tepi objek → makin menonjol (bentuk bulat natural)
   2. Detail  : luminance di dalam mask (area terang sedikit lebih menonjol)
   Output: Uint8ClampedArray (w*h), 0 = background, 255 = paling menonjol. */
export function computeDepth(rgba, w, h, { domeWeight = 0.65, blurRadius = 3 } = {}) {
    const n = w * h;
    const inside = new Uint8Array(n);
    const lum = new Float32Array(n);

    let insideCount = 0;
    for (let i = 0; i < n; i++) {
        const a = rgba[i * 4 + 3];
        if (a >= 96) {
            inside[i] = 1;
            insideCount++;
        }
        lum[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255;
    }
    if (insideCount === 0) return new Uint8ClampedArray(n);

    // Dome dari distance transform
    const dist = distanceTransform(inside, w, h);
    let maxD = 0;
    for (let i = 0; i < n; i++) if (dist[i] > maxD) maxD = dist[i];
    maxD = Math.max(1, maxD);

    // Normalisasi luminance hanya di dalam mask
    let lMin = 1;
    let lMax = 0;
    for (let i = 0; i < n; i++) {
        if (!inside[i]) continue;
        if (lum[i] < lMin) lMin = lum[i];
        if (lum[i] > lMax) lMax = lum[i];
    }
    const lRange = Math.max(0.001, lMax - lMin);

    const combined = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        if (!inside[i]) continue;
        const t = Math.min(1, dist[i] / maxD);
        const dome = 1 - (1 - t) * (1 - t); // naik cepat di tepi, landai di tengah
        const detail = (lum[i] - lMin) / lRange;
        combined[i] = dome * domeWeight + detail * (1 - domeWeight);
    }

    const smooth = boxBlur(combined, w, h, blurRadius, 2);

    let max = 0;
    for (let i = 0; i < n; i++) if (smooth[i] > max) max = smooth[i];
    max = Math.max(0.001, max);

    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = Math.round((smooth[i] / max) * 255);
    return out;
}

/* ---------- Geometry builder ----------
   rgba   : Uint8ClampedArray (w*h*4) — alpha dipakai sebagai mask
   depth  : Uint8ClampedArray (w*h)
   Return : { positions, uvs, indices, frontCount, vertexCount } */
export function buildGeometryData({
    rgba,
    depth,
    width,
    height,
    resolution,
    depthStrength,
    solid = false,
    thickness = 0.25,
    alphaThreshold = 0.35,
    worldSize = 1.6,
}) {
    const N = Math.max(2, resolution | 0);
    const W = width;
    const H = height;

    // Aspek rasio dipertahankan (sisi terpanjang = 2 * worldSize)
    const aspect = W / H;
    const sx = aspect >= 1 ? worldSize : worldSize * aspect;
    const sy = aspect >= 1 ? worldSize / aspect : worldSize;

    const sampleAlpha = (u, v) => {
        const x = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))));
        const y = Math.min(H - 1, Math.max(0, Math.round(v * (H - 1))));
        return rgba[(y * W + x) * 4 + 3] / 255;
    };

    const sampleDepth = (u, v) => {
        const fx = Math.min(W - 1, Math.max(0, u * (W - 1)));
        const fy = Math.min(H - 1, Math.max(0, v * (H - 1)));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(W - 1, x0 + 1);
        const y1 = Math.min(H - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const top = depth[y0 * W + x0] * (1 - tx) + depth[y0 * W + x1] * tx;
        const bot = depth[y1 * W + x0] * (1 - tx) + depth[y1 * W + x1] * tx;
        return (top * (1 - ty) + bot * ty) / 255;
    };

    const positions = [];
    const uvs = [];
    const vertexMap = new Int32Array(N * N).fill(-1);

    // ---- Vertices (front) ----
    for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
            const u = ix / (N - 1);
            const v = iy / (N - 1);
            if (sampleAlpha(u, v) < alphaThreshold) continue;

            vertexMap[iy * N + ix] = positions.length / 3;
            positions.push(
                (u - 0.5) * 2 * sx,
                -(v - 0.5) * 2 * sy,
                sampleDepth(u, v) * depthStrength
            );
            uvs.push(u, 1 - v);
        }
    }
    const frontCount = positions.length / 3;

    // ---- Triangles (front, menghadap +Z) ----
    const indices = [];
    for (let iy = 0; iy < N - 1; iy++) {
        for (let ix = 0; ix < N - 1; ix++) {
            const a = vertexMap[iy * N + ix];
            const b = vertexMap[iy * N + ix + 1];
            const c = vertexMap[(iy + 1) * N + ix];
            const d = vertexMap[(iy + 1) * N + ix + 1];

            if (a >= 0 && b >= 0 && c >= 0) indices.push(a, c, b);
            if (b >= 0 && c >= 0 && d >= 0) indices.push(b, c, d);
        }
    }

    // ---- Solid: back face + dinding tepi ----
    if (solid && frontCount > 0 && indices.length > 0) {
        const frontTriCount = indices.length;

        // Back vertices (bidang datar di z = -thickness)
        for (let i = 0; i < frontCount; i++) {
            positions.push(positions[i * 3], positions[i * 3 + 1], -thickness);
            uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
        }

        // Back triangles (winding dibalik → menghadap -Z)
        for (let i = 0; i < frontTriCount; i += 3) {
            indices.push(
                indices[i] + frontCount,
                indices[i + 1] + frontCount,
                indices[i + 2] + frontCount
            );
            // swap dua indeks terakhir
            const k = indices.length;
            const t = indices[k - 1];
            indices[k - 1] = indices[k - 2];
            indices[k - 2] = t;
        }

        // Boundary edges: edge berarah (p→q) yang kebalikannya (q→p) tidak ada
        const edgeKey = (p, q) => p * frontCount + q;
        const edges = new Set();
        for (let i = 0; i < frontTriCount; i += 3) {
            const t0 = indices[i];
            const t1 = indices[i + 1];
            const t2 = indices[i + 2];
            edges.add(edgeKey(t0, t1));
            edges.add(edgeKey(t1, t2));
            edges.add(edgeKey(t2, t0));
        }
        const addWall = (p, q) => {
            const pb = p + frontCount;
            const qb = q + frontCount;
            indices.push(p, pb, q, q, pb, qb);
        };
        for (const key of edges) {
            const p = Math.floor(key / frontCount);
            const q = key - p * frontCount;
            if (!edges.has(edgeKey(q, p))) addWall(p, q);
        }
    }

    return {
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
        frontCount,
        vertexCount: positions.length / 3,
    };
}
