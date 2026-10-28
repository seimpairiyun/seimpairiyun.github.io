/* ==================================================================
   IMAGE → 3D OBJECT EXTRACTOR
   ------------------------------------------------------------------
   Pipeline:
   1. Background removal  (bg-remove.js: AI + fallback color-key)
   2. Mask extraction     (alpha channel → grayscale preview)
   3. Depth estimation    (mesh-core.js: dome distance-transform + luminance)
   4. Mesh generation     (mesh-core.js: grid N×N, opsional solid)
   5. Render 360°         (Three.js + OrbitControls)
   6. Export GLB          (GLTFExporter)
   ================================================================== */

import { computeDepth, buildGeometryData } from './mesh-core.js?v=3';
import { removeBackgroundSmart } from './bg-remove.js?v=3';

const $ = (id) => document.getElementById(id);

/* ==================== KONFIGURASI ==================== */
const MAX_FILE_MB = 20;
const SOURCE_MAX = 1024; // ukuran maksimum input ke AI
const TEXTURE_MAX = 768; // ukuran maksimum texture + depth
const REBUILD_DEBOUNCE_MS = 120;

/* ==================== UI REFERENCES ==================== */
const viewport = document.querySelector('.viewport');
const canvas = $('canvas3d');

const imageInput = $('imageInput');
const fileName = $('fileName');
const processBtn = $('processBtn');
const resSelect = $('resSelect');
const depthScale = $('depthScale');
const depthVal = $('depthVal');
const solidToggle = $('solidToggle');
const thickness = $('thickness');
const thicknessVal = $('thicknessVal');
const rotSpeed = $('rotSpeed');
const rotVal = $('rotVal');
const showDepth = $('showDepth');
const showMask = $('showMask');
const wireToggle = $('wireToggle');
const bgToggle = $('bgToggle');
const resetBtn = $('resetBtn');
const screenshotBtn = $('screenshotBtn');
const exportBtn = $('exportBtn');
const loadingEl = $('loading');
const loadingText = $('loadingText');
const previewPanel = $('previewPanel');
const toastEl = $('toast');

/* ==================== HELPER UI ==================== */
let toastTimer = null;
function toast(message, type = 'info', ms = 6000) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + type;
    clearTimeout(toastTimer);
    if (ms > 0) toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function showLoading(text) {
    loadingText.textContent = text;
    loadingEl.classList.remove('hidden');
}
function hideLoading() {
    loadingEl.classList.add('hidden');
}

const nextFrame = () => new Promise((r) => setTimeout(r, 30));

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

/* ==================== CEK DEPENDENSI ==================== */
if (typeof THREE === 'undefined' || !THREE.OrbitControls || !THREE.GLTFExporter) {
    toast(
        'Three.js gagal dimuat (cek koneksi internet / adblock lalu refresh halaman).',
        'error',
        0
    );
    throw new Error('THREE / OrbitControls / GLTFExporter tidak tersedia');
}

/* ==================== THREE.JS SETUP ==================== */
const scene = new THREE.Scene();
const BG_COLOR = 0x0a0a0f;
scene.background = new THREE.Color(BG_COLOR);

const camera = new THREE.PerspectiveCamera(
    45,
    Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight),
    0.05,
    500
);
camera.position.set(0, 1.2, 3.5);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true, // diperlukan untuk screenshot
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputEncoding = THREE.sRGBEncoding; // warna texture akurat

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 20;

/* ---- Lights ---- */
scene.add(new THREE.AmbientLight(0xffffff, 0.65));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8899ff, 0.5);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x667eea, 0.8, 20);
rimLight.position.set(0, 3, -4);
scene.add(rimLight);

/* ---- Grid ---- */
const grid = new THREE.GridHelper(20, 20, 0x2a2a3a, 0x1a1a2e);
grid.position.y = -2;
scene.add(grid);

/* ==================== STATE ==================== */
const state = {
    source: null, // canvas gambar asli (di-resize)
    cutout: null, // { canvas, rgba, width, height }
    depth: null, // Uint8ClampedArray
    texture: null, // THREE.CanvasTexture
    mesh: null,
    autoRot: 0,
    busy: false,
};

/* ==================== FILE INPUT ==================== */
imageInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

// Drag & drop ke seluruh halaman
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
document.body.addEventListener('drop', (e) => loadFile(e.dataTransfer?.files?.[0]));

async function loadFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast('File harus berupa gambar (JPG, PNG, WebP, ...).', 'error');
        return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast(`Ukuran file maksimum ${MAX_FILE_MB} MB.`, 'error');
        return;
    }

    try {
        const img = await loadImage(file);
        state.source = document.createElement('canvas');
        drawToCanvas(img, state.source, SOURCE_MAX);

        fileName.textContent = file.name;
        processBtn.disabled = false;
        drawPreview('previewOriginal', state.source);
        syncPreviewVisibility();
        toast('Gambar siap. Klik "Proses → 3D".', 'info', 3000);
    } catch (err) {
        console.error(err);
        toast('Gagal membaca gambar: ' + err.message, 'error');
    }
}

/* ==================== PROCESS PIPELINE ==================== */
processBtn.addEventListener('click', processImage);

async function processImage() {
    if (!state.source || state.busy) return;
    state.busy = true;
    processBtn.disabled = true;
    exportBtn.disabled = true;

    try {
        /* ---- 1. Background removal ---- */
        showLoading('Menyiapkan...');
        const { canvas: cutoutFull, method } = await removeBackgroundSmart(state.source, {
            onStatus: showLoading,
            onNotice: (msg) => toast(msg, 'warn', 9000),
        });

        /* ---- 2. Base canvas (texture) ---- */
        const base = document.createElement('canvas');
        drawToCanvas(cutoutFull, base, TEXTURE_MAX);
        const ctx = base.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, base.width, base.height);

        /* ---- 3. Mask preview ---- */
        const maskCanvas = makeMaskCanvas(imageData);

        /* ---- 4. Depth ---- */
        showLoading('Mengestimasi kedalaman (depth map)...');
        await nextFrame();
        const depth = computeDepth(imageData.data, base.width, base.height);
        const depthCanvas = makeDepthCanvas(depth, base.width, base.height);

        /* ---- 5. Simpan state + preview ---- */
        if (state.texture) state.texture.dispose();
        state.texture = new THREE.CanvasTexture(base);
        state.texture.encoding = THREE.sRGBEncoding;
        state.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        state.cutout = { canvas: base, rgba: imageData.data, width: base.width, height: base.height };
        state.depth = depth;

        drawPreview('previewMask', maskCanvas);
        drawPreview('previewDepth', depthCanvas);
        syncPreviewVisibility();

        /* ---- 6. Mesh ---- */
        showLoading('Membangun mesh 3D...');
        await nextFrame();
        const ok = rebuildMesh({ fit: true });

        exportBtn.disabled = !ok;
        if (ok && method === 'ai') toast('Selesai! Drag untuk memutar model 360°.', 'info', 3500);
    } catch (err) {
        console.error(err);
        toast('Gagal memproses gambar: ' + (err?.message ?? err), 'error', 10000);
    } finally {
        state.busy = false;
        processBtn.disabled = false;
        hideLoading();
    }
}

/* ==================== MESH ==================== */
function disposeMesh() {
    if (!state.mesh) return;
    scene.remove(state.mesh);
    state.mesh.geometry.dispose();
    state.mesh.material.dispose(); // texture di-dispose terpisah (dipakai ulang)
    state.mesh = null;
}

function rebuildMesh({ fit = false } = {}) {
    if (!state.cutout || !state.depth) return false;

    const { rgba, width, height, canvas: texCanvas } = state.cutout;
    const data = buildGeometryData({
        rgba,
        depth: state.depth,
        width,
        height,
        resolution: parseInt(resSelect.value, 10),
        depthStrength: parseFloat(depthScale.value) * 0.5,
        solid: solidToggle.checked,
        thickness: parseFloat(thickness.value),
    });

    if (data.indices.length === 0) {
        toast('Tidak ada objek terdeteksi. Coba gambar dengan subjek yang lebih jelas.', 'warn');
        return false;
    }

    const prevRotY = state.mesh ? state.mesh.rotation.y : 0;
    disposeMesh();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.center();

    // Catatan: hanya `map` (tanpa vertexColors) agar warna tidak ter-multiply dua kali,
    // dan flipY dibiarkan default karena UV sudah memakai (u, 1 - v).
    const material = new THREE.MeshStandardMaterial({
        map: state.texture,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        wireframe: wireToggle.checked,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = prevRotY;
    scene.add(mesh);
    state.mesh = mesh;

    // grid tepat di bawah objek
    geometry.computeBoundingBox();
    grid.position.y = geometry.boundingBox.min.y - 0.02;

    if (fit) fitCamera();
    return true;
}

const scheduleRebuild = debounce(() => rebuildMesh(), REBUILD_DEBOUNCE_MS);

function fitCamera() {
    if (state.mesh) {
        state.mesh.geometry.computeBoundingSphere();
        const r = state.mesh.geometry.boundingSphere.radius;
        camera.position.set(0, r * 0.15, r * 2.6);
    } else {
        camera.position.set(0, 1.2, 3.5);
    }
    controls.target.set(0, 0, 0);
    controls.update();
}

/* ==================== UI EVENTS ==================== */
depthScale.addEventListener('input', () => {
    depthVal.textContent = parseFloat(depthScale.value).toFixed(1);
    scheduleRebuild();
});

thickness.addEventListener('input', () => {
    thicknessVal.textContent = parseFloat(thickness.value).toFixed(2);
    scheduleRebuild();
});

solidToggle.addEventListener('change', () => {
    thickness.disabled = !solidToggle.checked;
    rebuildMesh();
});

resSelect.addEventListener('change', () => rebuildMesh());

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

showMask.addEventListener('change', syncPreviewVisibility);
showDepth.addEventListener('change', syncPreviewVisibility);

resetBtn.addEventListener('click', () => {
    if (state.mesh) state.mesh.rotation.set(0, 0, 0);
    fitCamera();
});

screenshotBtn.addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
        if (blob) download(blob, `3d-view-${Date.now()}.png`);
    }, 'image/png');
});

exportBtn.addEventListener('click', () => {
    const mesh = state.mesh;
    if (!mesh) return;

    showLoading('Export GLB...');
    const rotY = mesh.rotation.y;
    mesh.rotation.y = 0; // export dalam orientasi netral, bukan posisi auto-rotate
    mesh.updateMatrixWorld(true);

    const restore = () => {
        mesh.rotation.y = rotY;
        hideLoading();
    };

    try {
        // three r128: parse(input, onDone, options) — TIDAK ada error callback.
        // (Kode lama memasukkan callback error di posisi `options`, sehingga
        //  `binary: true` tidak terbaca dan file yang dihasilkan bukan GLB valid.)
        new THREE.GLTFExporter().parse(
            mesh,
            (result) => {
                try {
                    const blob = new Blob([result], { type: 'model/gltf-binary' });
                    download(blob, 'object-3d.glb');
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

function makeMaskCanvas(imageData) {
    const { width, height, data } = imageData;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        out.data[i] = out.data[i + 1] = out.data[i + 2] = a;
        out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
}

function makeDepthCanvas(depth, width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(width, height);
    for (let i = 0; i < depth.length; i++) {
        const v = depth[i];
        out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
        out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
}

function drawPreview(id, src) {
    const el = $(id);
    if (!el) return;
    el.width = src.width;
    el.height = src.height;
    el.getContext('2d').drawImage(src, 0, 0);
}

function syncPreviewVisibility() {
    const items = previewPanel.querySelectorAll('.preview-item');
    if (items.length < 3) return;
    items[0].style.display = 'flex';
    items[1].style.display = showMask.checked ? 'flex' : 'none';
    items[2].style.display = showDepth.checked ? 'flex' : 'none';
    previewPanel.classList.toggle('hidden', !(showMask.checked || showDepth.checked));
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

/* ==================== RESIZE ==================== */
new ResizeObserver(() => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}).observe(viewport);

/* ==================== ANIMATION LOOP ==================== */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (state.mesh && state.autoRot > 0) {
        state.mesh.rotation.y += state.autoRot * dt * 0.6;
    }
    controls.update();
    renderer.render(scene, camera);
}
animate();

/* ==================== INIT ==================== */
syncPreviewVisibility();
