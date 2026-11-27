// Pembina geometri 3D: Bilah Low-Re, Hab, Barrier Ring (GPU), Ribs & Bingkai Lutsinar
import * as THREE from 'three';
import { getRadii, getStationAero, getSweep, generateThinAirfoil, getGlobalMetrics } from './aeroMath.js';

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

// Tukar titik 2D profil kepada koordinat 3D silinder pada stesen jejari u
function getSection3DPoints(u, p, nPts = 28) {
  const st = getStationAero(u, p);
  const camber = p.camberRoot + (p.camberTip - p.camberRoot) * u;
  const thick = p.thickRoot + (p.thickTip - p.thickRoot) * u;
  const sweep = getSweep(u, p);
  const loop2D = generateThinAirfoil(st.chord, camber, thick, p.teMin, nPts);

  const twistRad = (st.twistDeg * Math.PI) / 180;
  const cosT = Math.cos(twistRad);
  const sinT = Math.sin(twistRad);
  const r = st.rMm;

  return loop2D.map(({ x, y }) => {
    const tang = -x * cosT - y * sinT + sweep;
    const axial = x * sinT - y * cosT;
    const angle = tang / r;
    return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), axial);
  });
}

// Bina BufferGeometry pepejal tertutup bagi satu bilah
function buildBladeGeometry(p, spanSteps = 16, nPts = 28) {
  const sections = [];
  for (let s = 0; s <= spanSteps; s++) {
    const u = s / spanSteps;
    // Sedikit benam ke dalam hab (u = -0.04) supaya cantuman kukuh
    const uEff = s === 0 ? -0.04 : u;
    sections.push(getSection3DPoints(uEff, p, nPts));
  }

  const ringLen = sections[0].length;
  const positions = [];
  const indices = [];

  for (let s = 0; s <= spanSteps; s++) {
    for (let i = 0; i < ringLen; i++) {
      const v = sections[s][i];
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let s = 0; s < spanSteps; s++) {
    for (let i = 0; i < ringLen; i++) {
      const next = (i + 1) % ringLen;
      const a = s * ringLen + i;
      const b = s * ringLen + next;
      const c = (s + 1) * ringLen + next;
      const d = (s + 1) * ringLen + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Tutup pangkal & hujung bilah (cap)
  const addCap = (secIdx, flip) => {
    const sec = sections[secIdx];
    const center = new THREE.Vector3();
    sec.forEach((v) => center.add(v));
    center.divideScalar(sec.length);
    const cIdx = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    const base = secIdx * ringLen;
    for (let i = 0; i < ringLen; i++) {
      const next = (i + 1) % ringLen;
      if (flip) indices.push(cIdx, base + next, base + i);
      else indices.push(cIdx, base + i, base + next);
    }
  };
  addCap(0, true);
  addCap(spanSteps, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Bina hab rata kipas PC dengan lubang aci (shaft bore)
function buildHubGeometry(rHub, hubDepth, boreDiam) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rHub, 0, Math.PI * 2, false);
  if (boreDiam > 0.5 && boreDiam / 2 < rHub - 1) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreDiam / 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: hubDepth,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.6,
    bevelSegments: 2,
    curveSegments: 48
  });
  geo.translate(0, 0, -hubDepth / 2);
  return geo;
}

// Bina Barrier Ring (gelang hujung gaya kipas GPU)
function buildBarrierRingGeometry(rTip, ringThick, ringDepth) {
  const rInner = Math.max(5, rTip - ringThick);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rTip, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ringDepth,
    bevelEnabled: false,
    curveSegments: 64
  });
  geo.translate(0, 0, -ringDepth / 2);
  return geo;
}

// Bina bingkai lutsinar (Ghost Shroud) untuk semak had 25/30mm & tip clearance
function buildGhostFrameGeometry(p, rTip) {
  const half = p.frameSize / 2;
  const rCorner = Math.min(6, p.frameSize * 0.06);
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
  bore.absarc(0, 0, rTip + p.tipClearance, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.frameDepth,
    bevelEnabled: false,
    curveSegments: 64
  });
  geo.translate(0, 0, -p.frameDepth / 2);
  return geo;
}

export function rebuildFan3D(p, viewer, opts) {
  const { rotorGroup, singleBladeGroup, frameVisualGroup, axisGroup } = viewer;
  disposeGroup(rotorGroup);
  disposeGroup(singleBladeGroup);
  disposeGroup(frameVisualGroup);
  disposeGroup(axisGroup);

  const { rHub, rTip } = getRadii(p);
  const m = getGlobalMetrics(p);

  const bladeMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.38,
    metalness: 0.18,
    side: THREE.DoubleSide
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.42,
    metalness: 0.25
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: '#0284c7',
    roughness: 0.35,
    metalness: 0.2
  });

  // 1. Hab
  const hubMesh = new THREE.Mesh(buildHubGeometry(rHub, m.hubDepth, p.shaftBore), hubMat);
  rotorGroup.add(hubMesh);

  // 2. Bilah & Ribs
  const baseBladeGeo = buildBladeGeometry(p);
  singleBladeGroup.add(new THREE.Mesh(baseBladeGeo.clone(), bladeMat));

  const ribLineMat = new THREE.LineBasicMaterial({ color: '#38bdf8' });
  const ribUs = [0.05, 0.5, 0.96];

  for (let i = 0; i < p.blades; i++) {
    const angle = (i / p.blades) * Math.PI * 2;
    const mesh = new THREE.Mesh(baseBladeGeo, bladeMat);
    mesh.rotation.z = angle;
    rotorGroup.add(mesh);

    if (opts.showRibs && i === 0) {
      ribUs.forEach((u) => {
        const pts = getSection3DPoints(u, p, 32);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const loop = new THREE.LineLoop(lineGeo, ribLineMat);
        rotorGroup.add(loop);
      });
    }
  }

  // 3. Barrier Ring (jika aktif)
  if (p.barrierRing) {
    const tipSt = getStationAero(1, p);
    const tipAxial = tipSt.chord * Math.sin((tipSt.twistDeg * Math.PI) / 180);
    const ringDepth = Math.min(p.frameDepth - 2.0, Math.max(5, tipAxial * 1.08));
    const ringMesh = new THREE.Mesh(buildBarrierRingGeometry(rTip, p.ringThick, ringDepth), ringMat);
    rotorGroup.add(ringMesh);
  }

  // 4. Bingkai Lutsinar (Visual rujukan had 15/25/30mm)
  if (opts.showFrame) {
    const frameGeo = buildGhostFrameGeometry(p, rTip);
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.22,
      roughness: 0.2,
      depthWrite: false
    });
    frameVisualGroup.add(new THREE.Mesh(frameGeo, frameMat));

    const edges = new THREE.EdgesGeometry(frameGeo, 25);
    frameVisualGroup.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.5 })));
  }

  // 5. Penunjuk Paksi & Arah Aliran
  if (opts.showAxis) {
    const len = Math.max(30, p.frameDepth * 1.4);
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -len * 0.5),
      len,
      '#0284c7',
      len * 0.2,
      len * 0.1
    );
    axisGroup.add(arrow);
  }
}
