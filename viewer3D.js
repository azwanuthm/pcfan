// Pengurus paparan Three.js, pencahayaan gaya CAD & kawalan kamera pantas
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f6');

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 2000);
  camera.position.set(120, 95, 130);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Pencahayaan studio gaya CAD (jelas memisahkan bilah bertindih)
  scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 0.95));

  const keyLight = new THREE.DirectionalLight('#ffffff', 1.15);
  keyLight.position.set(120, 160, 140);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#bae6fd', 0.75);
  rimLight.position.set(-140, -90, -100);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight('#f8fafc', 0.45);
  fillLight.position.set(-80, 100, 120);
  scene.add(fillLight);

  // Kumpulan objek 3D
  const rotorGroup = new THREE.Group();
  const singleBladeGroup = new THREE.Group();
  const frameVisualGroup = new THREE.Group();
  const axisGroup = new THREE.Group();

  scene.add(rotorGroup);
  scene.add(frameVisualGroup);
  scene.add(axisGroup);

  function setCameraView(view, radiusMm = 60) {
    const d = Math.max(85, radiusMm * 3.1);
    controls.target.set(0, 0, 0);
    if (view === 'front') {
      camera.position.set(0, 0, d);
      camera.up.set(0, 1, 0);
    } else if (view === 'side') {
      camera.position.set(d, 0, 0);
      camera.up.set(0, 1, 0);
    } else if (view === 'top') {
      camera.position.set(0, d, 0.01);
      camera.up.set(0, 0, -1);
    } else {
      // Isometrik
      camera.position.set(d * 0.68, d * 0.52, d * 0.72);
      camera.up.set(0, 1, 0);
    }
    controls.update();
  }

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    rotorGroup,
    singleBladeGroup,
    frameVisualGroup,
    axisGroup,
    setCameraView
  };
}
