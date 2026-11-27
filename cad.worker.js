// Web Worker Enjin CAD (.STEP) berasaskan OpenCascade / Replicad
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC, getOC, makeCylinder, cast } from 'replicad';
import { getRadii, getStationAero, getSweep, generateThinAirfoil, getGlobalMetrics } from './aeroMath.js';

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

// Bina dawai tertutup bagi satu keratan bilah pada stesen u
function makeSectionWire(oc, u, p) {
  const st = getStationAero(u, p);
  const camber = p.camberRoot + (p.camberTip - p.camberRoot) * u;
  const thick = p.thickRoot + (p.thickTip - p.thickRoot) * u;
  const sweep = getSweep(u, p);

  const loop2D = generateThinAirfoil(st.chord, camber, thick, p.teMin, 18);
  const twistRad = (st.twistDeg * Math.PI) / 180;
  const cosT = Math.cos(twistRad);
  const sinT = Math.sin(twistRad);
  const r = st.rMm;

  const poly = new oc.BRepBuilderAPI_MakePolygon_1();
  for (let i = 0; i < loop2D.length; i++) {
    const { x, y } = loop2D[i];
    const tang = x * cosT - y * sinT + sweep;
    const axial = x * sinT + y * cosT;
    const angle = tang / r;
    const pnt = new oc.gp_Pnt_3(r * Math.cos(angle), r * Math.sin(angle), axial);
    poly.Add_1(pnt);
    pnt.delete();
  }
  poly.Close();
  const wire = poly.Wire();
  poly.delete();
  return wire;
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
