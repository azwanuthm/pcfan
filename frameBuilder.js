// Modul pembina Bingkai Sebenar (Shroud), 4 Lubang Skru & 4 Topang Stator Melengkung
import * as THREE from 'three';
import { getRadii } from './aeroMath.js';

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

// Koordinat 2D bagi satu topang melengkung (swept strut)
export function getStrutPolygon2D(rHub, rBore, strutWidth = 3.2, curveAngleRad = -0.35, steps = 14) {
  const rStart = Math.max(3, rHub * 0.78);
  const rEnd = rBore + 1.2; // benam sedikit ke dalam dinding bingkai
  const halfW = strutWidth / 2;
  const left = [];
  const right = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = rStart + (rEnd - rStart) * t;
    // Lengkungan halus ke belakang (lawan arah sapuan bilah)
    const ang = curveAngleRad * Math.pow(t, 1.35);
    const cx = r * Math.cos(ang);
    const cy = r * Math.sin(ang);

    // Vektor normal kepada garisan jejari
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

export function rebuildFrame3D(p, viewer, showFrame) {
  const { frameVisualGroup } = viewer;
  disposeGroup(frameVisualGroup);
  if (!showFrame) return;

  const { rHub, rTip } = getRadii(p);
  const rBore = rTip + p.tipClearance;
  const half = p.frameSize / 2;
  const rCorner = Math.min(6, p.frameSize * 0.06);
  const { pitch, holeR } = getMountSpec(p.frameSize);
  const hp = pitch / 2;

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: '#64748b',
    transparent: true,
    opacity: 0.32,
    roughness: 0.25,
    metalness: 0.1,
    depthWrite: false
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.55 });

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

  // 2. Tapak Motor (Stator Hub) di belakang (+Z)
  const strutDepth = p.frameDepth <= 15 ? 2.2 : 3.2;
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

  // 3. Empat (4) Topang Stator Melengkung
  const strutW = p.frameSize <= 60 ? 2.4 : 3.5;
  const polyPts = getStrutPolygon2D(rHub, rBore, strutW, -0.35, 14);
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

  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(strutGeo, frameMat);
    m.rotation.z = (i * Math.PI) / 2;
    frameVisualGroup.add(m);
  }
}
