// ============ SETUP SCENE ============
const canvas = document.getElementById('canvas3d');
const viewport = document.querySelector('.viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.Fog(0x0a0a0f, 10, 40);

const camera = new THREE.PerspectiveCamera(
    45,
    viewport.clientWidth / viewport.clientHeight,
    0.1,
    1000
);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 20;
controls.target.set(0, 0, 0);

// ============ LIGHTING ============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight1.position.set(5, 10, 7.5);
dirLight1.castShadow = true;
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0x88aaff, 0.5);
dirLight2.position.set(-5, -5, -5);
scene.add(dirLight2);

const pointLight = new THREE.PointLight(0x667eea, 1, 20);
pointLight.position.set(0, 5, 5);
scene.add(pointLight);

// ============ GRID & HELPERS ============
let gridHelper = new THREE.GridHelper(20, 20, 0x2a2a3a, 0x1a1a2e);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(2);
axesHelper.visible = false;
scene.add(axesHelper);

// ============ STATE ============
let currentMesh = null;
let currentTexture = null;
let autoRotateSpeed = 0;
let isWireframe = false;

// ============ UI ELEMENTS ============
const imageInput = document.getElementById('imageInput');
const fileName = document.getElementById('fileName');
const modeSelect = document.getElementById('modeSelect');
const depthRange = document.getElementById('depthRange');
const depthVal = document.getElementById('depthVal');
const rotationRange = document.getElementById('rotationRange');
const rotVal = document.getElementById('rotVal');
const wireframeToggle = document.getElementById('wireframeToggle');
const bgToggle = document.getElementById('bgToggle');
const resetBtn = document.getElementById('resetBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const exportBtn = document.getElementById('exportBtn');
const loading = document.getElementById('loading');

// ============ IMAGE LOADING ============
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileName.textContent = file.name;
    loading.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            createTexture(img);
            loading.classList.add('hidden');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

function createTexture(img) {
    if (currentTexture) currentTexture.dispose();
    currentTexture = new THREE.Texture(img);
    currentTexture.needsUpdate = true;
    currentTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    buildMesh();
}

// ============ MESH BUILDER ============
function buildMesh() {
    if (!currentTexture) return;

    // Remove old mesh
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
    }

    const mode = modeSelect.value;
    const depth = parseFloat(depthRange.value);
    let geometry;
    let material;

    const baseMaterial = new THREE.MeshStandardMaterial({
        map: currentTexture,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
        wireframe: isWireframe
    });

    switch (mode) {
        case 'plane':
            geometry = new THREE.PlaneGeometry(3, 3, 64, 64);
            material = baseMaterial;
            break;

        case 'box':
            geometry = new THREE.BoxGeometry(2.5, 2.5 * depth, 2.5, 32, 32, 32);
            material = baseMaterial;
            break;

        case 'cylinder':
            geometry = new THREE.CylinderGeometry(1.5, 1.5, 2.5 * depth, 64, 32, false);
            material = baseMaterial;
            break;

        case 'sphere':
            geometry = new THREE.SphereGeometry(1.8, 64, 64);
            material = baseMaterial;
            break;

        case 'extrude':
            // Relief mode - displace vertices based on brightness
            geometry = new THREE.PlaneGeometry(3, 3, 128, 128);
            displaceGeometry(geometry, depth);
            material = new THREE.MeshStandardMaterial({
                map: currentTexture,
                roughness: 0.7,
                metalness: 0.15,
                side: THREE.DoubleSide,
                wireframe: isWireframe
            });
            break;

        default:
            geometry = new THREE.PlaneGeometry(3, 3);
            material = baseMaterial;
    }

    currentMesh = new THREE.Mesh(geometry, material);
    currentMesh.castShadow = true;
    currentMesh.receiveShadow = true;
    scene.add(currentMesh);
}

// ============ DISPLACEMENT (Relief mode) ============
function displaceGeometry(geometry, depth) {
    // Draw image to canvas to sample pixel brightness
    const img = currentTexture.image;
    const tempCanvas = document.createElement('canvas');
    const size = 128;
    tempCanvas.width = size;
    tempCanvas.height = size;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const u = Math.floor((pos.getX(i) / 3 + 0.5) * (size - 1));
        const v = Math.floor((1 - (pos.getY(i) / 3 + 0.5)) * (size - 1));
        const idx = (v * size + u) * 4;
        const brightness = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
        const z = brightness * depth * 0.8;
        pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
}

// ============ UI EVENTS ============
modeSelect.addEventListener('change', buildMesh);

depthRange.addEventListener('input', (e) => {
    depthVal.textContent = parseFloat(e.target.value).toFixed(1);
    buildMesh();
});

rotationRange.addEventListener('input', (e) => {
    autoRotateSpeed = parseFloat(e.target.value);
    rotVal.textContent = autoRotateSpeed > 0 ? autoRotateSpeed.toFixed(1) : 'Off';
});

wireframeToggle.addEventListener('change', (e) => {
    isWireframe = e.target.checked;
    if (currentMesh) {
        currentMesh.material.wireframe = isWireframe;
    }
});

bgToggle.addEventListener('change', (e) => {
    gridHelper.visible = e.target.checked;
});

resetBtn.addEventListener('click', () => {
    camera.position.set(3, 2, 5);
    controls.target.set(0, 0, 0);
    controls.update();
});

screenshotBtn.addEventListener('click', () => {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = '3d-view-' + Date.now() + '.png';
    link.href = dataURL;
    link.click();
});

exportBtn.addEventListener('click', () => {
    if (!currentMesh) {
        alert('Silakan pilih gambar terlebih dahulu!');
        return;
    }
    loading.classList.remove('hidden');
    const exporter = new THREE.GLTFExporter();
    exporter.parse(
        currentMesh,
        (gltf) => {
            const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'model-3d.gltf';
            link.click();
            URL.revokeObjectURL(url);
            loading.classList.add('hidden');
        },
        (err) => {
            console.error(err);
            alert('Gagal export model');
            loading.classList.add('hidden');
        },
        { binary: false }
    );
});

// ============ RESIZE HANDLER ============
function handleResize() {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener('resize', handleResize);

// ============ ANIMATION LOOP ============
let clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (currentMesh && autoRotateSpeed > 0) {
        currentMesh.rotation.y += autoRotateSpeed * delta * 0.5;
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

// ============ DEFAULT: Load sample placeholder ============
function createPlaceholderTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#667eea');
    grad.addColorStop(1, '#764ba2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('3D', 256, 230);
    ctx.font = '28px sans-serif';
    ctx.fillText('Upload Gambar', 256, 290);
    return c;
}

// Init dengan placeholder
const placeholderCanvas = createPlaceholderTexture();
currentTexture = new THREE.CanvasTexture(placeholderCanvas);
currentTexture.needsUpdate = true;
buildMesh();
