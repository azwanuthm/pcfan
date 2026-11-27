// Web Worker Enjin CAD (.STEP) berasaskan OpenCascade / Replicad
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC, makeCylinder, cast, makeLine, assembleWire, draw, drawRoundedRectangle } from 'replicad';
import { getRadii, getStationAero, getSweep, generateThinAirfoil, getGlobalMetrics } from './aeroMath.js';
import { getMountSpec, getStrutPolygon2D } from './shroudBuilder.js';

let ocReady = null;

async function initCAD() {
  if (!ocReady) {
    ocReady = opencascade({
      locateFile: () => opencascadeWasm
    }).then((oc) => {
      setOC(oc);
      return oc;
    });
  }
  return ocReady;
}

// Bina dawai tertutup menggunakan API rasmi replicad (makeLine + assembleWire)
function makeSectionWire(oc, u, p) {
  const st = getStationAero(u, p);
  const camber = p.camberRoot + (p.camberTip - p.camberRoot) * u;
  const thick = p.thickRoot + (p.thickTip - p.thickRoot) * u;
  const sweep = getSweep(u, p);

  const loop2D = generateThinAirfoil(st.chord, camber, thick, p.teMin, 24);
  const twistRad = (st.twistDeg * Math.PI) / 180;
  const cosT = Math.cos(twistRad);
  const sinT = Math.sin(twistRad);
  const r = st.rMm;

  const pts = loop2D.map(({ x, y }) => {
    const tang = -x * cosT - y * sinT + sweep;
    const axial = x * sinT - y * cosT;
    const angle = tang / r;
    return [r * Math.cos(angle), r * Math.sin(angle), axial];
  });

  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    if (dist > 1e-4) {
      edges.push(makeLine(p1, p2));
    }
  }

  const wire = assembleWire(edges);
  return wire.wrapped;
}

// Bina pepejal satu bilah menggunakan Loft NURBS (ThruSections)
function buildBladeSolid(oc, p) {
  const thru = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-3);
  const stations = [-0.04, 0.08, 0.25, 0.45, 0.65, 0.85, 1.0];

  for (const u of stations) {
    const wire = makeSectionWire(oc, u, p);
    thru.AddWire(wire);
  }
  thru.Build(new oc.Message_ProgressRange_1());
  const solid = cast(thru.Shape());
  thru.delete();
  return solid;
}

self.onmessage = async (e) => {
  const { mode, params: p } = e.data;
  try {
    self.postMessage({ type: 'progress', message: 'Memuatkan enjin OpenCascade...' });
    const oc = await initCAD();

    if (mode === 'shroud') {
      self.postMessage({ type: 'progress', message: 'Membina pepejal Shroud & Stator...' });
      const { rHub, rTip } = getRadii(p);
      const rBore = rTip + p.tipClearance;
      const rCorner = Math.min(6, p.frameSize * 0.06);
      const { pitch, holeR } = getMountSpec(p.frameSize);
      const hp = pitch / 2;

      let frame = drawRoundedRectangle(p.frameSize, p.frameSize, rCorner)
        .sketchOnPlane('XY', -p.frameDepth / 2)
        .extrude(p.frameDepth);

      const bore = makeCylinder(rBore, p.frameDepth + 4, [0, 0, -p.frameDepth / 2 - 2], [0, 0, 1]);
      frame = frame.cut(bore);

      for (const [hx, hy] of [[-hp, -hp], [hp, -hp], [hp, hp], [-hp, hp]]) {
        const hole = makeCylinder(holeR, p.frameDepth + 4, [hx, hy, -p.frameDepth / 2 - 2], [0, 0, 1]);
        frame = frame.cut(hole);
      }

      if (sp.frameMode !== 'gpu') {
        const strutDepth = Math.min(sp.strutDepth, p.frameDepth * 0.35);
        const zRearStart = p.frameDepth / 2 - strutDepth;

        let stator = makeCylinder(rHub * 0.92, strutDepth, [0, 0, zRearStart], [0, 0, 1]);
        if (p.shaftBore > 0.5 && p.shaftBore / 2 < rHub * 0.7) {
          const sb = makeCylinder(p.shaftBore / 2, strutDepth + 4, [0, 0, zRearStart - 2], [0, 0, 1]);
          stator = stator.cut(sb);
        }
        frame = frame.fuse(stator);

        const pts = getStrutPolygon2D(rHub, rBore, sp.strutWidth, sp.strutSweepDeg, 16);
        let pen = draw(pts[0]);
        for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
        const baseStrut = pen.close().sketchOnPlane('XY', zRearStart).extrude(strutDepth);

        for (let i = 0; i < sp.strutCount; i++) {
          const deg = (i * 360) / sp.strutCount;
          const st = i === 0 ? baseStrut : baseStrut.clone().rotate(deg, [0, 0, 0], [0, 0, 1]);
          frame = frame.fuse(st);
        }
      }

      self.postMessage({ type: 'progress', message: 'Mengeksport fail .STEP Shroud...' });
      const blob = frame.blobSTEP();
      const buffer = await blob.arrayBuffer();
      self.postMessage({ type: 'done', buffer }, [buffer]);
      return;
    }
    
    self.postMessage({ type: 'progress', message: 'Menjana permukaan NURBS bilah...' });
    const blade = buildBladeSolid(oc, p);

    let finalShape = blade;

    if (mode === 'rotor') {
      const { rHub, rTip } = getRadii(p);
      const m = getGlobalMetrics(p);

      self.postMessage({ type: 'progress', message: 'Membina hab & mencantumkan bilah...' });
      let hub = makeCylinder(rHub, m.hubDepth, [0, 0, -m.hubDepth / 2], [0, 0, 1]);

      if (p.shaftBore > 0.5 && p.shaftBore / 2 < rHub - 1) {
        const bore = makeCylinder(p.shaftBore / 2, m.hubDepth + 4, [0, 0, -m.hubDepth / 2 - 2], [0, 0, 1]);
        hub = hub.cut(bore);
      }

      let rotor = hub;
      for (let i = 0; i < p.blades; i++) {
        const deg = (i * 360) / p.blades;
        const rotated = i === 0 ? blade : blade.clone().rotate(deg, [0, 0, 0], [0, 0, 1]);
        rotor = rotor.fuse(rotated);
      }

      // Cantum Barrier Ring (gaya kipas GPU) jika diaktifkan
      if (p.barrierRing) {
        self.postMessage({ type: 'progress', message: 'Menambah Barrier Ring (GPU)...' });
        const tipSt = getStationAero(1, p);
        const tipAxial = tipSt.chord * Math.sin((tipSt.twistDeg * Math.PI) / 180);
        const ringDepth = Math.min(p.frameDepth - 2.0, Math.max(5, tipAxial * 1.08));
        const rInner = Math.max(5, rTip - p.ringThick);

        const outerCyl = makeCylinder(rTip, ringDepth, [0, 0, -ringDepth / 2], [0, 0, 1]);
        const innerCyl = makeCylinder(rInner, ringDepth + 4, [0, 0, -ringDepth / 2 - 2], [0, 0, 1]);
        const ring = outerCyl.cut(innerCyl);
        rotor = rotor.fuse(ring);
      }

      finalShape = rotor;
    }

    self.postMessage({ type: 'progress', message: 'Mengeksport fail .STEP...' });
    const blob = finalShape.blobSTEP();
    const buffer = await blob.arrayBuffer();
    self.postMessage({ type: 'done', buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
