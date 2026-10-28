/* ==================================================================
   BACKGROUND REMOVAL
   ------------------------------------------------------------------
   1. AI  : @imgly/background-removal (ES module, dimuat lazy dari CDN,
            dengan beberapa sumber cadangan)
   2. Fallback: color-key (flood fill dari tepi gambar) — bekerja baik untuk
            background polos / hampir polos, tanpa download model.

   Bug lama: `window.imglyBackgroundRemoval.removeBackground(...)`
   → library ini ESM-only, tidak pernah membuat global `window.imglyBackgroundRemoval`,
   sehingga error "Cannot read properties of undefined (reading 'removeBackground')".
   ================================================================== */

const LIB_VERSION = '1.4.5';

const CDN_SOURCES = [
    `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${LIB_VERSION}/+esm`,
    `https://esm.sh/@imgly/background-removal@${LIB_VERSION}`,
];

let libPromise = null;

/** Muat library sekali saja; coba tiap CDN sampai ada yang berhasil. */
function loadLibrary() {
    if (libPromise) return libPromise;

    libPromise = (async () => {
        const errors = [];
        for (const url of CDN_SOURCES) {
            try {
                const mod = await import(/* @vite-ignore */ url);
                const fn =
                    mod.removeBackground ??
                    mod.default?.removeBackground ??
                    (typeof mod.default === 'function' ? mod.default : null);
                if (typeof fn === 'function') return fn;
                errors.push(`${url}: export removeBackground tidak ditemukan`);
            } catch (err) {
                errors.push(`${url}: ${err?.message ?? err}`);
            }
        }
        throw new Error('Library background removal gagal dimuat.\n' + errors.join('\n'));
    })();

    // Jika gagal, izinkan percobaan ulang di proses berikutnya
    libPromise.catch(() => {
        libPromise = null;
    });

    return libPromise;
}

/* ---------- helpers ---------- */
function canvasToBlob(canvas, type = 'image/png') {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Gagal mengonversi canvas ke blob'))),
            type
        );
    });
}

function blobToCanvas(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(c);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Hasil background removal tidak bisa dibaca'));
        };
        img.src = url;
    });
}

/* ---------- Fallback: color-key flood fill (fungsi murni, bisa dites) ----------
   Memodifikasi channel alpha pada `rgba` secara in-place.
   Return: persentase piksel yang dianggap objek (0..1). */
export function colorKeyAlpha(rgba, w, h) {
    const n = w * h;

    // 1. Warna background = rata-rata piksel pada bingkai tepi
    const border = [];
    const pushBorder = (x, y) => border.push((y * w + x) * 4);
    for (let x = 0; x < w; x++) {
        pushBorder(x, 0);
        pushBorder(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
        pushBorder(0, y);
        pushBorder(w - 1, y);
    }

    let mr = 0, mg = 0, mb = 0;
    for (const i of border) {
        mr += rgba[i];
        mg += rgba[i + 1];
        mb += rgba[i + 2];
    }
    mr /= border.length;
    mg /= border.length;
    mb /= border.length;

    let dev = 0;
    for (const i of border) {
        dev += Math.hypot(rgba[i] - mr, rgba[i + 1] - mg, rgba[i + 2] - mb);
    }
    dev /= border.length;

    // Toleransi adaptif: background bergradasi/noisy → toleransi lebih besar
    const tol = Math.min(95, Math.max(32, 30 + dev * 2.5));

    const isBg = (i) => {
        if (rgba[i + 3] < 16) return true; // sudah transparan
        return Math.hypot(rgba[i] - mr, rgba[i + 1] - mg, rgba[i + 2] - mb) <= tol;
    };

    // 2. Flood fill 4-arah dari seluruh piksel tepi yang mirip background
    const bg = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    const tryPush = (x, y) => {
        const p = y * w + x;
        if (bg[p]) return;
        if (!isBg(p * 4)) return;
        bg[p] = 1;
        queue[tail++] = p;
    };

    for (let x = 0; x < w; x++) {
        tryPush(x, 0);
        tryPush(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
        tryPush(0, y);
        tryPush(w - 1, y);
    }
    while (head < tail) {
        const p = queue[head++];
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) tryPush(x - 1, y);
        if (x < w - 1) tryPush(x + 1, y);
        if (y > 0) tryPush(x, y - 1);
        if (y < h - 1) tryPush(x, y + 1);
    }

    // 3. Mask → alpha, lalu haluskan tepi dengan box blur 3×3
    const soft = new Float32Array(n);
    for (let i = 0; i < n; i++) soft[i] = bg[i] ? 0 : 1;

    const blurred = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let cnt = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= w) continue;
                    sum += soft[ny * w + nx];
                    cnt++;
                }
            }
            blurred[y * w + x] = sum / cnt;
        }
    }

    let objectCount = 0;
    for (let i = 0; i < n; i++) {
        rgba[i * 4 + 3] = Math.round(blurred[i] * rgba[i * 4 + 3]);
        if (!bg[i]) objectCount++;
    }
    return objectCount / n;
}

function fallbackRemove(sourceCanvas) {
    const out = document.createElement('canvas');
    out.width = sourceCanvas.width;
    out.height = sourceCanvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const coverage = colorKeyAlpha(img.data, out.width, out.height);
    ctx.putImageData(img, 0, 0);
    return { canvas: out, coverage };
}

/* ---------- API utama ----------
   sourceCanvas : canvas gambar asli (sudah di-resize)
   Return       : { canvas, method: 'ai' | 'fallback' } */
export async function removeBackgroundSmart(
    sourceCanvas,
    { onStatus = () => {}, onNotice = () => {} } = {}
) {
    try {
        onStatus('Memuat library AI...');
        const removeBackground = await loadLibrary();

        const input = await canvasToBlob(sourceCanvas, 'image/png');
        onStatus('Memisahkan objek dari background...');

        const resultBlob = await removeBackground(input, {
            output: { format: 'image/png', quality: 1 },
            progress: (key, current, total) => {
                if (typeof key === 'string' && key.startsWith('fetch') && total > 0) {
                    const pct = Math.round((current / total) * 100);
                    onStatus(`Download model AI: ${pct}% (hanya pertama kali)`);
                } else if (typeof key === 'string' && key.startsWith('compute')) {
                    onStatus('Memisahkan objek dari background...');
                }
            },
        });

        return { canvas: await blobToCanvas(resultBlob), method: 'ai' };
    } catch (err) {
        console.warn('[bg-remove] AI gagal, memakai fallback:', err);
        onNotice(
            'Model AI tidak bisa dimuat (' +
                (err?.message?.split('\n')[0] ?? 'unknown') +
                '). Memakai metode sederhana — hasil terbaik untuk background polos.'
        );
        onStatus('Menghapus background (metode sederhana)...');
        await new Promise((r) => setTimeout(r, 30));
        const { canvas, coverage } = fallbackRemove(sourceCanvas);
        if (coverage < 0.01) {
            throw new Error('Objek tidak terdeteksi. Gunakan gambar dengan background lebih kontras.');
        }
        return { canvas, method: 'fallback' };
    }
}
