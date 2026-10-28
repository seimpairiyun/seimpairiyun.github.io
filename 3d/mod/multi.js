/* ==================================================================
   MULTI-FOTO → 3D 360°  (semua berjalan di browser)
   ------------------------------------------------------------------
   1. Tiap foto : background removal (bg-remove.js) → siluet + warna
   2. Carving   : carve-core.js (visual hull, signed distance + surface nets)
   3. Warna     : proyeksi foto ke vertex (blend berdasar arah hadap)
   4. Render    : Three.js + OrbitControls, export GLB
   ================================================================== */

import { removeBackgroundSmart } from './bg-remove.js?v=3';
import { prepareView, carve, cameraBasis, VIEW_PRESETS } from './carve-core.js?v=3';

const $ = (id) => document.getElementById(id);

/* ==================== KONFIGURASI ==================== */
const MAX_FILE_MB = 20;
const MAX_PHOTOS = 12;
const SOURCE_MAX = 1024; // ke AI
const VIEW_MAX = 512; // untuk siluet + warna
const PRESET_ORDER = ['front', 'right', 'back', 'left', 'top', 'bottom'];

/* ==================== UI REFERENCES ==================== */
const viewport = document.querySelector('.viewport');
const canvas = $('canvas3d');
const imageInput = $('imageInput');
const fileName = $('fileName');
const viewList = $('viewList');
const processBtn = $('processBtn');
const resSelect = $('resSelect');
const biasSlider = $('biasSlider');
const biasVal = $('biasVal');
const rotSpeed = $('rotSpeed');
const rotVal = $('rotVal');
const wireToggle = $('wireToggle');
const bgToggle = $('bgToggle');
const resetBtn = $('resetBtn');
const screenshotBtn = $('screenshotBtn');
const exportBtn = $('exportBtn');
const loadingEl = $('loading');
const loadingText = $('loadingText');
const toastEl = $('toast');

/* ==================== HELPER UI ==================== */
let toastTimer = null;
function toast(message, type = 'info', ms = 6000) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + type;
    clearTimeout(toastTimer);
    if (ms > 0) toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}
const showLoading = (t) => {
    loadingText.textContent = t;
    loadingEl.classList.remove('hidden');
};
const hideLoading = () => loadingEl.classList.add('hidden');
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

function debounce(fn, ms) {
    let t;
    return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
}

/* ==================== CEK DEPENDENSI ==================== */
if (typeof THREE === 'undefined' || !THREE.OrbitControls || !THREE.GLTFExporter) {
    toast('Three.js gagal dimuat (cek koneksi internet / adblock lalu refresh halaman).', 'error', 0);
    throw new Error('THREE / OrbitControls / GLTFExporter tidak tersedia');
}

/* ==================== THREE.JS SETUP ==================== */
const BG_COLOR = 0x0a0a0f;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);

const camera = new THREE.PerspectiveCamera(
    45,
    Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight),
    0.05,
    500
);
camera.position.set(0, 0.6, 3);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputEncoding = THREE.sRGBEncoding;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.3;
controls.maxDistance = 20;

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-3, 2, -4);
scene.add(fillLight);

const grid = new THREE.GridHelper(20, 20, 0x2a2a3a, 0x1a1a2e);
grid.position.y = -0.6;
scene.add(grid);

/* ==================== STATE ==================== */
let nextId = 1;
const state = {
    items: [], // { id, name, source, cutout, view, preset, az, el, adj:{scale,dx,dy}, thumb }
    mesh: null,
    autoRot: 0,
    busy: false,
    pending: false,
    hasModel: false,
};

/* ==================== FILE INPUT ==================== */
imageInput.addEventListener('change', async (e) => {
    await addFiles([...e.target.files]);
    imageInput.value = '';
});
['dragenter', 'dragover'].forEach((ev) =>
    document.body.addEventListener(ev, (e) => {
        e.preventDefault();
        viewport.classList.add('drop-active');
    })
);
['dragleave', 'drop'].forEach((ev) =>
    document.body.addEventListener(ev, (e) => {
        e.preventDefault();
        viewport.classList.remove('drop-active');
    })
);
document.body.addEventListener('drop', (e) => addFiles([...(e.dataTransfer?.files ?? [])]));

async function addFiles(files) {
    for (const file of files) {
        if (state.items.length >= MAX_PHOTOS) {
            toast(`Maksimum ${MAX_PHOTOS} foto.`, 'warn');
            break;
        }
        if (!file.type.startsWith('image/')) {
            toast(`"${file.name}" bukan gambar, dilewati.`, 'warn');
            continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
            toast(`"${file.name}" lebih dari ${MAX_FILE_MB} MB, dilewati.`, 'warn');
            continue;
        }
        try {
            const img = await loadImage(file);
            const source = document.createElement('canvas');
            drawToCanvas(img, source, SOURCE_MAX);

            const used = new Set(state.items.map((i) => i.preset));
            const preset = PRESET_ORDER.find((p) => !used.has(p)) ?? 'custom';
            const p = VIEW_PRESETS[preset] ?? { azimuth: 0, elevation: 0 };

            const item = {
                id: nextId++,
                name: file.name,
                source,
                cutout: null,
                view: null,
                preset,
                az: p.azimuth,
                el: p.elevation,
                adj: { scale: 1, dx: 0, dy: 0 },
            };
            state.items.push(item);
            viewList.appendChild(createCard(item));
            drawThumb(item, source);
        } catch (err) {
            console.error(err);
            toast(`Gagal membaca "${file.name}": ${err.message}`, 'error');
        }
    }
    updateSummary();
}

function updateSummary() {
    const n = state.items.length;
    fileName.textContent = n ? `${n} foto` : 'Belum ada foto';
    processBtn.disabled = n < 2 || state.busy;
}

/* ==================== KARTU FOTO ==================== */
function createCard(item) {
    const el = document.createElement('div');
    el.className = 'view-card';

    const presetOptions = Object.entries(VIEW_PRESETS)
        .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
        .join('');

    el.innerHTML = `
        <div class="vc-head">
            <canvas class="vc-thumb" width="56" height="56"></canvas>
            <div class="vc-main">
                <div class="vc-name"></div>
                <select class="vc-preset">${presetOptions}<option value="custom">Sudut kustom…</option></select>
            </div>
            <button class="vc-del" title="Hapus foto">✕</button>
        </div>
        <div class="vc-custom hidden">
            <label>Azimuth (°)<input type="number" class="vc-az" min="-180" max="180" step="5"></label>
            <label>Elevasi (°)<input type="number" class="vc-el" min="-90" max="90" step="5"></label>
        </div>
        <details class="vc-fine">
            <summary>Fine-tune posisi</summary>
            <label>Skala: <span class="vc-sv">1.00</span>×<input type="range" class="vc-scale" min="0.7" max="1.4" step="0.01" value="1"></label>
            <label>Geser X: <span class="vc-xv">0.0</span>%<input type="range" class="vc-dx" min="-15" max="15" step="0.5" value="0"></label>
            <label>Geser Y: <span class="vc-yv">0.0</span>%<input type="range" class="vc-dy" min="-15" max="15" step="0.5" value="0"></label>
        </details>`;

    el.querySelector('.vc-name').textContent = item.name;
    item.thumb = el.querySelector('.vc-thumb');

    const select = el.querySelector('.vc-preset');
    const custom = el.querySelector('.vc-custom');
    const az = el.querySelector('.vc-az');
    const elv = el.querySelector('.vc-el');
    select.value = item.preset;
    az.value = item.az;
    elv.value = item.el;
    custom.classList.toggle('hidden', item.preset !== 'custom');

    select.addEventListener('change', () => {
        item.preset = select.value;
        if (item.preset !== 'custom') {
            item.az = VIEW_PRESETS[item.preset].azimuth;
            item.el = VIEW_PRESETS[item.preset].elevation;
            az.value = item.az;
            elv.value = item.el;
        }
        custom.classList.toggle('hidden', item.preset !== 'custom');
        scheduleRegenerate();
    });
    az.addEventListener('input', () => {
        item.az = clampNum(az.value, -180, 180);
        scheduleRegenerate();
    });
    elv.addEventListener('input', () => {
        item.el = clampNum(elv.value, -90, 90);
        scheduleRegenerate();
    });

    const bindRange = (cls, labelCls, apply, fmt) => {
        const input = el.querySelector(cls);
        const label = el.querySelector(labelCls);
        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            apply(v);
            label.textContent = fmt(v);
            scheduleRegenerate();
        });
    };
    bindRange('.vc-scale', '.vc-sv', (v) => (item.adj.scale = v), (v) => v.toFixed(2));
    bindRange('.vc-dx', '.vc-xv', (v) => (item.adj.dx = v / 100), (v) => v.toFixed(1));
    bindRange('.vc-dy', '.vc-yv', (v) => (item.adj.dy = v / 100), (v) => v.toFixed(1));

    el.querySelector('.vc-del').addEventListener('click', () => {
        state.items = state.items.filter((i) => i.id !== item.id);
        el.remove();
        updateSummary();
    });
    return el;
}

function clampNum(v, lo, hi) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
}

function drawThumb(item, src) {
    const c = item.thumb;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / src.width, c.height / src.height);
    const w = src.width * s;
    const h = src.height * s;
    ctx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
}

/* ==================== GENERATE ==================== */
processBtn.addEventListener('click', () => generate());

const scheduleRegenerate = debounce(() => {
    if (state.hasModel) generate();
}, 450);

biasSlider.addEventListener('input', () => {
    biasVal.textContent = biasSlider.value;
    scheduleRegenerate();
});
resSelect.addEventListener('change', () => {
    if (state.hasModel) generate();
});

async function generate() {
    if (state.busy) {
        state.pending = true;
        return;
    }
    const items = [...state.items];
    if (items.length < 2) {
        toast('Tambahkan minimal 2 foto dari sudut berbeda.', 'warn');
        return;
    }

    state.busy = true;
    processBtn.disabled = true;
    exportBtn.disabled = true;

    try {
        /* ---- 1. Background removal (hanya foto yang belum diproses) ---- */
        const todo = items.filter((it) => !it.cutout);
        for (let k = 0; k < todo.length; k++) {
            const it = todo[k];
            const tag = `Foto ${k + 1}/${todo.length}`;
            showLoading(`${tag}: menyiapkan...`);

            const { canvas: full } = await removeBackgroundSmart(it.source, {
                onStatus: (s) => showLoading(`${tag}: ${s}`),
                onNotice: (m) => toast(m, 'warn', 9000),
            });

            const small = document.createElement('canvas');
            drawToCanvas(full, small, VIEW_MAX);
            const data = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, small.width, small.height);

            try {
                it.view = prepareView({
                    rgba: data.data,
                    width: small.width,
                    height: small.height,
                    azimuth: it.az,
                    elevation: it.el,
                });
            } catch (err) {
                throw new Error(`"${it.name}": ${err.message}`);
            }
            it.cutout = small;
            drawThumb(it, small);
            await nextFrame();
        }

        /* ---- 2. Views + validasi ---- */
        const views = items.map((it) => {
            const v = it.view;
            v.azimuth = it.az;
            v.elevation = it.el;
            v.basis = cameraBasis(it.az, it.el);
            return v;
        });
        warnDuplicateAngles(views);

        /* ---- 3. Carving ---- */
        showLoading('Memahat volume 3D...');
        await nextFrame();
        const result = await carve(views, {
            res: parseInt(resSelect.value, 10),
            biasPx: parseFloat(biasSlider.value),
            adjustments: items.map((i) => i.adj),
            onProgress: (p) => showLoading(`Memahat volume 3D... ${Math.round(p * 100)}%`),
        });

        if (result.indices.length === 0) {
            toast(
                'Tidak ada volume yang tersisa — siluet antar foto tidak konsisten. ' +
                    'Cek pilihan sudut tiap foto, atau naikkan "Toleransi Siluet".',
                'warn',
                10000
            );
            return;
        }

        /* ---- 4. Mesh ---- */
        showLoading('Membangun mesh...');
        await nextFrame();
        buildMesh(result);
        state.hasModel = true;
        exportBtn.disabled = false;
        toast(`Selesai: ${(result.indices.length / 3).toLocaleString('id-ID')} segitiga. Drag untuk memutar 360°.`, 'info', 4000);
    } catch (err) {
        console.error(err);
        toast('Gagal membuat model: ' + (err?.message ?? err), 'error', 10000);
    } finally {
        state.busy = false;
        hideLoading();
        updateSummary();
        if (state.pending) {
            state.pending = false;
            generate();
        }
    }
}

function warnDuplicateAngles(views) {
    for (let i = 0; i < views.length; i++) {
        for (let j = i + 1; j < views.length; j++) {
            const a = views[i].basis.d;
            const b = views[j].basis.d;
            if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.99) {
                toast(`Foto ${i + 1} dan ${j + 1} memakai sudut yang sama — tidak menambah informasi.`, 'warn', 7000);
                return;
            }
        }
    }
}

/* ==================== MESH ==================== */
function disposeMesh() {
    if (!state.mesh) return;
    scene.remove(state.mesh);
    state.mesh.geometry.dispose();
    state.mesh.material.dispose();
    state.mesh = null;
}

function buildMesh({ positions, indices, normals, colors }) {
    const isFirst = !state.mesh;
    const prevRotY = state.mesh ? state.mesh.rotation.y : 0;
    disposeMesh();

    // sRGB → linear (renderer memakai outputEncoding sRGB; glTF juga mengharapkan linear)
    const linear = new Float32Array(colors.length);
    for (let i = 0; i < colors.length; i++) linear[i] = Math.pow(colors[i], 2.2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(linear, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.0,
        side: THREE.DoubleSide,
        wireframe: wireToggle.checked,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = prevRotY;
    scene.add(mesh);
    state.mesh = mesh;

    grid.position.y = geometry.boundingBox.min.y - 0.01;
    if (isFirst) fitCamera();
}

function fitCamera() {
    if (state.mesh) {
        const r = state.mesh.geometry.boundingSphere.radius;
        camera.position.set(0, r * 0.3, r * 2.8);
    } else {
        camera.position.set(0, 0.6, 3);
    }
    controls.target.set(0, 0, 0);
    controls.update();
}

/* ==================== UI EVENTS ==================== */
rotSpeed.addEventListener('input', () => {
    state.autoRot = parseFloat(rotSpeed.value);
    rotVal.textContent = state.autoRot > 0 ? state.autoRot.toFixed(1) : 'Off';
});
wireToggle.addEventListener('change', () => {
    if (state.mesh) state.mesh.material.wireframe = wireToggle.checked;
});
bgToggle.addEventListener('change', () => {
    grid.visible = bgToggle.checked;
    scene.background = bgToggle.checked ? new THREE.Color(BG_COLOR) : null;
});
resetBtn.addEventListener('click', () => {
    if (state.mesh) state.mesh.rotation.set(0, 0, 0);
    fitCamera();
});
screenshotBtn.addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((b) => b && download(b, `3d-view-${Date.now()}.png`), 'image/png');
});

exportBtn.addEventListener('click', () => {
    const mesh = state.mesh;
    if (!mesh) return;
    showLoading('Export GLB...');
    const rotY = mesh.rotation.y;
    mesh.rotation.y = 0;
    mesh.updateMatrixWorld(true);
    const restore = () => {
        mesh.rotation.y = rotY;
        hideLoading();
    };
    try {
        // three r128: parse(input, onDone, options) — tidak ada error callback
        new THREE.GLTFExporter().parse(
            mesh,
            (result) => {
                try {
                    download(new Blob([result], { type: 'model/gltf-binary' }), 'object-3d-multi.glb');
                } finally {
                    restore();
                }
            },
            { binary: true, onlyVisible: true }
        );
    } catch (err) {
        console.error(err);
        toast('Export gagal: ' + err.message, 'error');
        restore();
    }
});

/* ==================== HELPERS ==================== */
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('format gambar tidak didukung browser'));
        };
        img.src = url;
    });
}

function drawToCanvas(img, target, maxSize) {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSize / Math.max(w0, h0));
    target.width = Math.max(1, Math.round(w0 * scale));
    target.height = Math.max(1, Math.round(h0 * scale));
    const ctx = target.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, target.width, target.height);
}

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ==================== RESIZE + LOOP ==================== */
new ResizeObserver(() => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}).observe(viewport);

const clock = new THREE.Clock();
(function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (state.mesh && state.autoRot > 0) state.mesh.rotation.y += state.autoRot * dt * 0.6;
    controls.update();
    renderer.render(scene, camera);
})();

updateSummary();
