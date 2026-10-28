/* ==================================================================
   IMAGE → 3D OBJECT EXTRACTOR
   ------------------------------------------------------------------
   Pipeline:
   1. Background removal  (@imgly/background-removal, ES module)
   2. Mask extraction     (alpha channel → grayscale)
   3. Depth estimation    (luminance + box blur heuristic)
   4. Mesh generation     (grid N×N, skip alpha < 0.15)
   5. Render 360°         (Three.js + OrbitControls)
   6. Export GLB          (GLTFExporter)
   ================================================================== */

/* ==================== IMPORT (ES MODULE) ==================== */
import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';

/* ==================== THREE.JS SETUP ==================== */
const canvas = document.getElementById('canvas3d');
const viewport = document.querySelector('.viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const camera = new THREE.PerspectiveCamera(
    45,
    viewport.clientWidth / viewport.clientHeight,
    0.05,
    500
);
camera.position.set(0, 1.2, 3.5);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 20;

/* ==================== LIGHTS ==================== */
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

/* ==================== GRID ==================== */
const grid = new THREE.GridHelper(20, 20, 0x2a2a3a, 0x1a1a2e);
scene.add(grid);

/* ==================== STATE ==================== */
let mesh = null;
let originalCanvas = null;
let maskCanvas = null;
let depthCanvas = null;
let cutoutCanvas = null; // cache: cutout dengan alpha
let autoRot = 0;
let wireframe = false;

/* ==================== UI REFERENCES ==================== */
const $ = (id) => document.getElementById(id);

const imageInput = $('imageInput');
const fileName = $('fileName');
const processBtn = $('processBtn');
const resSelect = $('resSelect');
const depthScale = $('depthScale');
const depthVal = $('depthVal');
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

/* ==================== FILE INPUT ==================== */
let loadedImage = null;

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileName.textContent = file.name;

    const img = new Image();
    img.onload = () => {
        loadedImage = img;
        processBtn.disabled = false;

        // Tampilkan preview original
        originalCanvas = document.createElement('canvas');
        drawToCanvas(img, originalCanvas, 512);
        replaceCanvas('previewOriginal', originalCanvas);
        syncPreviewVisibility();
    };
    img.src = URL.createObjectURL(file);
});

/* ==================== PROCESS PIPELINE ==================== */
processBtn.addEventListener('click', async () => {
    if (!loadedImage) return;
    processBtn.disabled = true;

    try {
        /* ---- 1. Background removal ---- */
        showLoading('Memisahkan objek dari background...');

        const cutoutBlob = await removeBackground(loadedImage.src, {
            output: { format: 'image/png', quality: 1 },
            progress: (key, current, total) => {
                if (typeof key === 'string' && key.startsWith('fetch')) {
                    const pct = Math.round((current / total) * 100);
                    showLoading(`Download model AI: ${pct}%`);
                }
            },
        });

        const cutoutImg = await blobToImage(cutoutBlob);

        /* ---- 2. Prepare base canvas ---- */
        const baseCanvas = document.createElement('canvas');
        drawToCanvas(cutoutImg, baseCanvas, 512);
        cutoutCanvas = baseCanvas;

        const ctxBase = baseCanvas.getContext('2d');
        const BW = baseCanvas.width;
        const BH = baseCanvas.height;
        const baseData = ctxBase.getImageData(0, 0, BW, BH);

        /* ---- 3. Mask canvas (alpha → grayscale) ---- */
        maskCanvas = document.createElement('canvas');
        maskCanvas.width = BW;
        maskCanvas.height = BH;
        const mCtx = maskCanvas.getContext('2d');
        const mData = mCtx.createImageData(BW, BH);
        for (let i = 0; i < baseData.data.length; i += 4) {
            const a = baseData.data[i + 3];
            mData.data[i] = a;
            mData.data[i + 1] = a;
            mData.data[i + 2] = a;
            mData.data[i + 3] = 255;
        }
        mCtx.putImageData(mData, 0, 0);

        /* ---- 4. Depth estimation ---- */
        showLoading('Mengestimasi kedalaman (depth map)...');
        await new Promise((r) => setTimeout(r, 50));
        depthCanvas = await estimateDepth(baseCanvas);

        /* ---- 5. Update previews ---- */
        replaceCanvas('previewMask', maskCanvas);
        replaceCanvas('previewDepth', depthCanvas);
        syncPreviewVisibility();

        /* ---- 6. Build mesh ---- */
        showLoading('Membangun mesh 3D...');
        await new Promise((r) => setTimeout(r, 50));
        buildMeshFromData({
            colorCanvas: cutoutCanvas,
            maskCanvas,
            depthCanvas,
            resolution: parseInt(resSelect.value, 10),
        });

        exportBtn.disabled = false;
        processBtn.disabled = false;
        hideLoading();
    } catch (err) {
        console.error(err);
        alert('Gagal memproses gambar: ' + err.message);
        processBtn.disabled = false;
        hideLoading();
    }
});

/* ==================== DEPTH ESTIMATION ==================== */
async function estimateDepth(sourceCanvas) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;

    // Luminance (dikalikan alpha agar background = 0)
    const lum = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
        const r = d[i * 4];
        const g = d[i * 4 + 1];
        const b = d[i * 4 + 2];
        const a = d[i * 4 + 3];
        lum[i] = ((r * 0.299 + g * 0.587 + b * 0.114) / 255) * (a / 255);
    }

    // Blur 2 pass (haluskan)
    let smooth = lum;
    for (let pass = 0; pass < 2; pass++) {
        smooth = boxBlur(smooth, size, size, 1);
    }

    // Normalize ke 0..255
    let min = 1;
    let max = 0;
    for (const v of smooth) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = Math.max(0.001, max - min);

    const out = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
        const v = Math.floor(((smooth[i] - min) / range) * 255);
        out.data[i * 4] = v;
        out.data[i * 4 + 1] = v;
        out.data[i * 4 + 2] = v;
        out.data[i * 4 + 3] = 255;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = size;
    outCanvas.height = size;
    outCanvas.getContext('2d').putImageData(out, 0, 0);
    return outCanvas;
}

function boxBlur(src, w, h, r) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let count = 0;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        sum += src[ny * w + nx];
                        count++;
                    }
                }
            }
            out[y * w + x] = sum / count;
        }
    }
    return out;
}

/* ==================== MESH BUILDER ==================== */
function buildMeshFromData({ colorCanvas, maskCanvas, depthCanvas, resolution }) {
    // Cleanup mesh lama
    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
        mesh = null;
    }

    const N = resolution;

    const colorData = colorCanvas
        .getContext('2d')
        .getImageData(0, 0, colorCanvas.width, colorCanvas.height).data;
    const maskData = maskCanvas
        .getContext('2d')
        .getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const depthData = depthCanvas
        .getContext('2d')
        .getImageData(0, 0, depthCanvas.width, depthCanvas.height).data;

    const CW = colorCanvas.width;
    const CH = colorCanvas.height;
    const MW = maskCanvas.width;
    const MH = maskCanvas.height;
    const DW = depthCanvas.width;
    const DH = depthCanvas.height;

    const sampleRGB = (data, W, H, u, v) => {
        const x = Math.min(W - 1, Math.max(0, Math.floor(u * (W - 1))));
        const y = Math.min(H - 1, Math.max(0, Math.floor(v * (H - 1))));
        const i = (y * W + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    const positions = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const depthStrength = parseFloat(depthScale.value) * 0.5;
    const S = 1.6; // lebar plane dunia

    const vertexMap = new Int32Array(N * N).fill(-1);
    const indexAt = (ix, iy) => iy * N + ix;

    const pushVertex = (ix, iy) => {
        const u = ix / (N - 1);
        const v = iy / (N - 1);

        const [cr, cg, cb, ca] = sampleRGB(colorData, CW, CH, u, v);
        const [, , , ma] = sampleRGB(maskData, MW, MH, u, v);
        const [dr] = sampleRGB(depthData, DW, DH, u, v);

        const alpha = (ca / 255) * (ma / 255);
        if (alpha < 0.15) {
            vertexMap[indexAt(ix, iy)] = -1;
            return;
        }

        const px = (u - 0.5) * 2 * S;
        const py = -(v - 0.5) * 2 * S;
        const pz = (dr / 255) * depthStrength;

        const idx = positions.length / 3;
        positions.push(px, py, pz);
        uvs.push(u, 1 - v); // flip V
        colors.push(cr / 255, cg / 255, cb / 255);
        vertexMap[indexAt(ix, iy)] = idx;
    };

    // Build vertices
    for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
            pushVertex(ix, iy);
        }
    }

    // Build triangles
    for (let iy = 0; iy < N - 1; iy++) {
        for (let ix = 0; ix < N - 1; ix++) {
            const a = vertexMap[indexAt(ix, iy)];
            const b = vertexMap[indexAt(ix + 1, iy)];
            const c = vertexMap[indexAt(ix, iy + 1)];
            const d = vertexMap[indexAt(ix + 1, iy + 1)];

            if (a >= 0 && b >= 0 && c >= 0) indices.push(a, c, b);
            if (b >= 0 && c >= 0 && d >= 0) indices.push(b, c, d);
        }
    }

    if (positions.length === 0) {
        alert('Tidak ada objek terdeteksi. Coba gambar dengan subjek lebih jelas.');
        return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Texture dari cutout
    const tex = new THREE.CanvasTexture(colorCanvas);
    tex.flipY = false;
    tex.needsUpdate = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const material = new THREE.MeshStandardMaterial({
        map: tex,
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.05,
        wireframe,
    });

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Fit camera
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere.radius;
    camera.position.set(0, 0.3, radius * 2.2);
    controls.target.set(0, 0, 0);
    controls.update();
}

/* ==================== UI EVENTS ==================== */
depthScale.addEventListener('input', () => {
    depthVal.textContent = parseFloat(depthScale.value).toFixed(1);
    if (mesh && cutoutCanvas && maskCanvas && depthCanvas) {
        buildMeshFromData({
            colorCanvas: cutoutCanvas,
            maskCanvas,
            depthCanvas,
            resolution: parseInt(resSelect.value, 10),
        });
    }
});

resSelect.addEventListener('change', () => {
    if (mesh && cutoutCanvas && maskCanvas && depthCanvas) {
        buildMeshFromData({
            colorCanvas: cutoutCanvas,
            maskCanvas,
            depthCanvas,
            resolution: parseInt(resSelect.value, 10),
        });
    }
});

rotSpeed.addEventListener('input', () => {
    autoRot = parseFloat(rotSpeed.value);
    rotVal.textContent = autoRot > 0 ? autoRot.toFixed(1) : 'Off';
});

wireToggle.addEventListener('change', () => {
    wireframe = wireToggle.checked;
    if (mesh) mesh.material.wireframe = wireframe;
});

bgToggle.addEventListener('change', () => {
    grid.visible = bgToggle.checked;
    scene.background = bgToggle.checked ? new THREE.Color(0x0a0a0f) : null;
});

showMask.addEventListener('change', syncPreviewVisibility);
showDepth.addEventListener('change', syncPreviewVisibility);

resetBtn.addEventListener('click', () => {
    if (mesh) {
        mesh.geometry.computeBoundingSphere();
        const r = mesh.geometry.boundingSphere.radius;
        camera.position.set(0, 0.3, r * 2.2);
    } else {
        camera.position.set(0, 1.2, 3.5);
    }
    controls.target.set(0, 0, 0);
    controls.update();
});

screenshotBtn.addEventListener('click', () => {
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = '3d-view-' + Date.now() + '.png';
    a.href = url;
    a.click();
});

exportBtn.addEventListener('click', () => {
    if (!mesh) return;
    showLoading('Export GLB...');
    const exporter = new THREE.GLTFExporter();
    exporter.parse(
        mesh,
        (gltf) => {
            const blob = new Blob([gltf], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'object-3d.glb';
            a.click();
            URL.revokeObjectURL(url);
            hideLoading();
        },
        (err) => {
            console.error(err);
            alert('Export gagal');
            hideLoading();
        },
        { binary: true }
    );
});

/* ==================== HELPERS ==================== */
function blobToImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}

function drawToCanvas(img, canvas, maxSize = 512) {
    let w = img.width;
    let h = img.height;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    w *= scale;
    h *= scale;
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
}

function replaceCanvas(id, srcCanvas) {
    const old = document.getElementById(id);
    if (!old) return;
    const c = document.createElement('canvas');
    c.id = id;
    c.width = srcCanvas.width;
    c.height = srcCanvas.height;
    c.getContext('2d').drawImage(srcCanvas, 0, 0);
    old.replaceWith(c);
}

function syncPreviewVisibility() {
    const items = previewPanel.querySelectorAll('.preview-item');
    if (items.length < 3) return;
    items[0].style.display = 'flex';
    items[1].style.display = showMask.checked ? 'flex' : 'none';
    items[2].style.display = showDepth.checked ? 'flex' : 'none';
    const anyOn = showMask.checked || showDepth.checked;
    previewPanel.classList.toggle('hidden', !anyOn);
}

function showLoading(text) {
    loadingText.textContent = text;
    loadingEl.classList.remove('hidden');
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

/* ==================== RESIZE ==================== */
window.addEventListener('resize', () => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

/* ==================== ANIMATION LOOP ==================== */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    if (mesh && autoRot > 0) {
        mesh.rotation.y += autoRot * dt * 0.6;
    }

    controls.update();
    renderer.render(scene, camera);
}
animate();

/* ==================== INIT ==================== */
syncPreviewVisibility();
