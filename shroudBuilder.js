// Modul Pembina Shroud / Bingkai & Topang Stator (Workspace 2)
import * as THREE from 'three';
import { getRadii } from './aeroMath.js';

export function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

// Jarak pusat-ke-pusat lubang skru piawai kipas PC (mm)
export function getMountSpec(frameSize) {
  const map = {
    40:  { pitch: 32.0,  holeR: 1.75 },
    60:  { pitch: 50.0,  holeR: 2.15 },
    80:  { pitch: 71.5,  holeR: 2.25 },
    92:  { pitch: 82.5,  holeR: 2.25 },
    120: { pitch: 105.0, holeR: 2.25 },
    140: { pitch: 124.5, holeR: 2.25 }
  };
  return map[frameSize] || { pitch: frameSize * 0.86, holeR: 2.2 };
}

// Koordinat 2D bagi satu topang stator melengkung (lawan arah putaran rotor)
export function getStrutPolygon2D(rHub, rBore, strutWidth = 3.2, sweepDeg = 20, steps = 16) {
  const rStart = Math.max(3, rHub * 0.78);
  const rEnd = rBore + 1.2;
  const halfW = strutWidth / 2;
  const curveAngleRad = -(sweepDeg * Math.PI) / 180;
  const left = [];
  const right = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = rStart + (rEnd - rStart) * t;
    const ang = curveAngleRad * Math.pow(t, 1.35);
    const cx = r * Math.cos(ang);
    const cy = r * Math.sin(ang);

    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);

    left.push([cx + nx * halfW, cy + ny * halfW]);
    right.push([cx - nx * halfW, cy - ny * halfW]);
  }

  return [...left, ...right.reverse()];
}

function disposeGroup(group) {
  while (group.children.length > 0) {
    const obj = group.children.pop();
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  }
}

export function rebuildShroud3D(p, sp, viewer, { visible, solidMode }) {
  const { frameVisualGroup } = viewer;
  disposeGroup(frameVisualGroup);
  if (!visible) return;

  const { rHub, rTip } = getRadii(p);
  const rBore = rTip + p.tipClearance;
  const half = p.frameSize / 2;
  const rCorner = Math.min(6, p.frameSize * 0.06);
  const { pitch, holeR } = getMountSpec(p.frameSize);
  const hp = pitch / 2;

  const frameMat = solidMode
    ? new THREE.MeshPhysicalMaterial({
        color: '#334155',
        roughness: 0.35,
        metalness: 0.15,
        clearcoat: 0.2
      })
    : new THREE.MeshPhysicalMaterial({
        color: '#64748b',
        transparent: true,
        opacity: 0.28,
        roughness: 0.25,
        metalness: 0.1,
        depthWrite: false
      });

  const edgeMat = new THREE.LineBasicMaterial({
    color: solidMode ? '#0f172a' : '#475569',
    transparent: true,
    opacity: solidMode ? 0.4 : 0.5
  });

  // 1. Bingkai Luar + Lubang Tengah + 4 Lubang Skru
  const shape = new THREE.Shape();
  shape.moveTo(-half + rCorner, -half);
  shape.lineTo(half - rCorner, -half);
  shape.quadraticCurveTo(half, -half, half, -half + rCorner);
  shape.lineTo(half, half - rCorner);
  shape.quadraticCurveTo(half, half, half - rCorner, half);
  shape.lineTo(-half + rCorner, half);
  shape.quadraticCurveTo(-half, half, -half, half - rCorner);
  shape.lineTo(-half, -half + rCorner);
  shape.quadraticCurveTo(-half, -half, -half + rCorner, -half);

  const bore = new THREE.Path();
  bore.absarc(0, 0, rBore, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  [[-hp, -hp], [hp, -hp], [hp, hp], [-hp, hp]].forEach(([hx, hy]) => {
    const h = new THREE.Path();
    h.absarc(hx, hy, holeR, 0, Math.PI * 2, true);
    shape.holes.push(h);
  });

  const shroudGeo = new THREE.ExtrudeGeometry(shape, {
    depth: p.frameDepth,
    bevelEnabled: false,
    curveSegments: 64
  });
  shroudGeo.translate(0, 0, -p.frameDepth / 2);
  frameVisualGroup.add(new THREE.Mesh(shroudGeo, frameMat));
  frameVisualGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(shroudGeo, 25), edgeMat));

  // Jika Mod GPU (Tanpa Stator), berhenti di sini
  if (sp.frameMode === 'gpu') return;

  // 2. Tapak Motor (Stator Hub) di bahagian belakang (+Z)
  const strutDepth = Math.min(sp.strutDepth, p.frameDepth * 0.35);
  const zRearStart = p.frameDepth / 2 - strutDepth;

  const statorShape = new THREE.Shape();
  statorShape.absarc(0, 0, rHub * 0.92, 0, Math.PI * 2, false);
  if (p.shaftBore > 0.5 && p.shaftBore / 2 < rHub * 0.7) {
    const sh = new THREE.Path();
    sh.absarc(0, 0, p.shaftBore / 2, 0, Math.PI * 2, true);
    statorShape.holes.push(sh);
  }
  const statorGeo = new THREE.ExtrudeGeometry(statorShape, {
    depth: strutDepth,
    bevelEnabled: false,
    curveSegments: 48
  });
  statorGeo.translate(0, 0, zRearStart);
  frameVisualGroup.add(new THREE.Mesh(statorGeo, frameMat));
  frameVisualGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(statorGeo, 25), edgeMat));

  // 3. Topang Stator Melengkung (3, 4, atau 5 topang)
  const polyPts = getStrutPolygon2D(rHub, rBore, sp.strutWidth, sp.strutSweepDeg, 16);
  const strutShape = new THREE.Shape();
  polyPts.forEach(([x, y], i) => {
    if (i === 0) strutShape.moveTo(x, y);
    else strutShape.lineTo(x, y);
  });
  strutShape.closePath();

  const strutGeo = new THREE.ExtrudeGeometry(strutShape, {
    depth: strutDepth,
    bevelEnabled: false
  });
  strutGeo.translate(0, 0, zRearStart);

  for (let i = 0; i < sp.strutCount; i++) {
    const m = new THREE.Mesh(strutGeo, frameMat);
    m.rotation.z = (i * 2 * Math.PI) / sp.strutCount;
    frameVisualGroup.add(m);
  }
}
