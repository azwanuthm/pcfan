// Konduktor utama: menyambungkan UI kepada semua modul projek (Sistem 2-Workspace)
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

import { PRESETS } from './presets.js';
import { getGlobalMetrics } from './aeroMath.js';
import { createViewer } from './viewer3D.js';
import { rebuildFan3D } from './fanBuilder.js';
import { rebuildShroud3D, gcd } from './shroudBuilder.js';
import { drawCharts2D } from './charts2D.js';
import { buildReportText, initParamExporter } from './paramExporter.js';

const $ = (id) => document.getElementById(id);
const viewer = createViewer($('canvasWrap'));

let activeWorkspace = 'rotor';

function readParams() {
  return {
    frameSize: Number($('selFrameSize').value),
    frameDepth: Number($('selFrameDepth').value),
    tipClearance: Number($('inpTipClearance').value),
    hubRatio: Number($('inpHubRatio').value),
    blades: Number($('inpBlades').value),
    rpm: Number($('inpRPM').value),
    targetVz: Number($('inpVz').value),
    autoTwist: $('chkAutoTwist').checked,
    aoa: Number($('inpAoA').value),
    rootTwist: Number($('inpRootTwist').value),
    tipTwist: Number($('inpTipTwist').value),
    rootChord: Number($('inpRootChord').value),
    taper: Number($('inpTaper').value),
    midBulge: Number($('inpMidBulge').value),
    sweepMode: $('selSweepMode').value,
    sweepAmp: Number($('inpSweepAmp').value),
    camberRoot: Number($('inpCamberRoot').value),
    camberTip: Number($('inpCamberTip').value),
    thickRoot: Number($('inpThickRoot').value),
    thickTip: Number($('inpThickTip').value),
    teMin: Number($('inpTEMin').value),
    barrierRing: $('chkBarrierRing').checked,
    ringThick: Number($('inpRingThick').value),
    shaftBore: Number($('inpShaftBore').value),
    heatLoadW: Number($('inpHeatLoad').value),
    deltaTAir: Number($('inpDeltaT').value)
  };
}

function readShroudParams() {
  return {
    frameMode: $('selFrameMode').value,
    strutCount: Number($('inpStrutCount').value),
    strutSweepDeg: Number($('inpStrutSweep').value),
    strutWidth: Number($('inpStrutWidth').value),
    strutDepth: Number($('inpStrutDepth').value),
    showGhostRotor: $('chkGhostRotor').checked
  };
}

function syncLabels(p) {
  $('valTipClearance').textContent = `${p.tipClearance.toFixed(1)} mm`;
  $('valHubRatio').textContent = p.hubRatio.toFixed(2);
  $('valBlades').textContent = p.blades;
  $('valRPM').textContent = `${p.rpm} rpm`;
  $('valVz').textContent = `${p.targetVz.toFixed(1)} m/s`;
  $('valAoA').textContent = `${p.aoa.toFixed(1)}°`;
  $('valRootTwist').textContent = `${p.rootTwist}°`;
  $('valTipTwist').textContent = `${p.tipTwist}°`;
  $('valRootChord').textContent = `${p.rootChord} mm`;
  $('valTaper').textContent = `${p.taper.toFixed(2)} x`;
  $('valMidBulge').textContent = `${p.midBulge.toFixed(2)} x`;
  $('valSweepAmp').textContent = `${p.sweepAmp} mm`;
  $('valCamberRoot').textContent = `${p.camberRoot.toFixed(1)}%`;
  $('valCamberTip').textContent = `${p.camberTip.toFixed(1)}%`;
  $('valThickRoot').textContent = `${p.thickRoot.toFixed(1)}%`;
  $('valThickTip').textContent = `${p.thickTip.toFixed(1)}%`;
  $('valTEMin').textContent = `${p.teMin.toFixed(1)} mm`;
  $('valShaftBore').textContent = `${p.shaftBore.toFixed(1)} mm`;
  $('valRingThick').textContent = `${p.ringThick.toFixed(1)} mm`;
  $('valHeatLoad').textContent = `${p.heatLoadW} W`;
  $('valDeltaT').textContent = `${p.deltaTAir} °C`;

  $('wrapAoA').classList.toggle('hidden', !p.autoTwist);
  $('wrapManualTwist').classList.toggle('hidden', p.autoTwist);
  $('wrapRingThick').classList.toggle('hidden', !p.barrierRing);
  $('badgeMode').textContent = p.autoTwist ? 'FREE VORTEX' : 'MANUAL TWIST';
}

function updateAll() {
  const p = readParams();
  const sp = readShroudParams();
  const isShroud = activeWorkspace === 'shroud';

  syncLabels(p);

  const m = getGlobalMetrics(p);
  $('clampWarn').classList.toggle('hidden', !m.anyClamped);

  // Kemas kini panel metrik
  $('outDiameter').textContent = `${m.diameterMm.toFixed(1)} mm`;
  $('outFlowCFM').textContent = `${m.flowCFM.toFixed(1)} CFM`;
  $('outFlowM3h').textContent = `${m.flowM3h.toFixed(1)} m³/h`;
  $('outTipSpeed').textContent = `${m.uTip.toFixed(1)} m/s`;
  $('outReMid').textContent = `${Math.round(m.reMid).toLocaleString()}`;
  $('outBPF').textContent = `${m.bpfHz.toFixed(0)} Hz`;
  $('outSolidity').textContent = `${(m.solidityMid * 100).toFixed(0)}%`;
  $('outTwistRange').textContent = `${m.rootTwist.toFixed(0)}° → ${m.tipTwist.toFixed(0)}°`;
  $('outReqFlow').textContent = `${m.reqFlowCFM.toFixed(1)} CFM`;

  const marginEl = $('outThermalMargin');
  marginEl.textContent = `${m.thermalMarginPct >= 0 ? '+' : ''}${m.thermalMarginPct.toFixed(0)}%`;
  marginEl.className = m.thermalMarginPct >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';

  // Kemas kini label Workspace 2 (Shroud & Stator)
  $('valStrutCount').textContent = sp.strutCount;
  $('valStrutSweep').textContent = `${sp.strutSweepDeg}°`;
  $('valStrutWidth').textContent = `${sp.strutWidth.toFixed(1)} mm`;
  $('valStrutDepth').textContent = `${sp.strutDepth.toFixed(1)} mm`;
  $('wrapStatorControls').classList.toggle('hidden', sp.frameMode === 'gpu');

  // Semakan Coprime (Z vs S)
  const isNotCoprime = sp.frameMode !== 'gpu' && gcd(p.blades, sp.strutCount) > 1;
  $('coprimeWarn').classList.toggle('hidden', !isNotCoprime);

  // Dimensi Auto-Sync
  $('syncFrame').textContent = `${p.frameSize}×${p.frameDepth}`;
  $('syncBore').textContent = `${(m.diameterMm + 2 * p.tipClearance).toFixed(1)} mm`;
  $('syncGap').textContent = `${p.tipClearance.toFixed(1)} mm`;
  $('syncBlades').textContent = p.blades;

  // Kemas kini 3D Rotor & Shroud
  rebuildFan3D(p, viewer, {
    showRibs: !isShroud && $('chkRibs').checked,
    showFrame: false,
    showAxis: $('chkAxis').checked
  });
  viewer.rotorGroup.visible = !isShroud || sp.showGhostRotor;

  rebuildShroud3D(p, sp, viewer, {
    visible: isShroud || $('chkFrame').checked,
    solidMode: isShroud
  });

  // Kemas kini graf 2D
  const stationU = Number($('selStation').value);
  drawCharts2D(p, stationU, $('canvasAirfoil'), $('canvasTriangle'), $('stationBadge'));
}

// --- Muat Turun Fail & Enjin CAD (.STEP) ---
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getBaseName(prefix) {
  const p = readParams();
  return `${prefix}_${p.frameSize}x${p.frameDepth}mm_${p.blades}B_${p.rpm}rpm`;
}

let cadWorker = null;
function setStepBusy(busy, msg = '') {
  $('btnExportBladeSTEP').disabled = busy;
  $('btnExportRotorSTEP').disabled = busy;
  $('btnExportShroudSTEP').disabled = busy;
  $('cadStatus').textContent = msg;
  $('cadStatus').classList.toggle('hidden', !msg || activeWorkspace !== 'rotor');
  $('shroudCadStatus').textContent = msg;
  $('shroudCadStatus').classList.toggle('hidden', !msg || activeWorkspace !== 'shroud');
}

function requestSTEP(mode, prefix) {
  if (!cadWorker) {
    cadWorker = new Worker(new URL('./cad.worker.js', import.meta.url), { type: 'module' });
  }
  const baseName = getBaseName(prefix);
  setStepBusy(true, 'Memulakan enjin CAD...');
  cadWorker.onmessage = (e) => {
    const { type, message, buffer } = e.data;
    if (type === 'progress') setStepBusy(true, message);
    else if (type === 'done') {
      downloadBlob(new Blob([buffer], { type: 'application/step' }), `${baseName}.step`);
      setStepBusy(false);
    } else if (type === 'error') {
      alert('Ralat menjana STEP: ' + message);
      setStepBusy(false);
    }
  };
  cadWorker.postMessage({ mode, params: readParams(), shroudParams: readShroudParams() });
}

// --- Penukar Workspace (Tab) ---
function switchWorkspace(ws) {
  activeWorkspace = ws;
  const isRotor = ws === 'rotor';
  $('wsRotor').classList.toggle('hidden', !isRotor);
  $('wsShroud').classList.toggle('hidden', isRotor);
  $('wsShroud').classList.toggle('flex', !isRotor);

  $('tabRotor').className = isRotor
    ? 'rounded-lg bg-white py-1.5 text-xs font-extrabold text-sky-700 shadow-sm'
    : 'rounded-lg py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900';
  $('tabShroud').className = !isRotor
    ? 'rounded-lg bg-white py-1.5 text-xs font-extrabold text-sky-700 shadow-sm'
    : 'rounded-lg py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900';

  updateAll();
}

$('tabRotor').addEventListener('click', () => switchWorkspace('rotor'));
$('tabShroud').addEventListener('click', () => switchWorkspace('shroud'));

// --- Event Listeners ---
let debounceTimer;
function scheduleUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateAll, 25);
}

document.querySelectorAll('input, select').forEach((el) => {
  el.addEventListener('input', scheduleUpdate);
  el.addEventListener('change', scheduleUpdate);
});

function applyPreset(key) {
  const pr = PRESETS[key];
  if (!pr) return;
  const v = pr.values;
  $('presetNote').textContent = pr.note;

  $('selFrameSize').value = v.frameSize;
  $('selFrameDepth').value = v.frameDepth;
  $('inpTipClearance').value = v.tipClearance;
  $('inpHubRatio').value = v.hubRatio;
  $('inpBlades').value = v.blades;
  $('inpRPM').value = v.rpm;
  $('inpVz').value = v.targetVz;
  $('chkAutoTwist').checked = v.autoTwist;
  $('inpAoA').value = v.aoa;
  $('inpRootTwist').value = v.rootTwist;
  $('inpTipTwist').value = v.tipTwist;
  $('inpRootChord').value = v.rootChord;
  $('inpTaper').value = v.taper;
  $('inpMidBulge').value = v.midBulge;
  $('selSweepMode').value = v.sweepMode;
  $('inpSweepAmp').value = v.sweepAmp;
  $('inpCamberRoot').value = v.camberRoot;
  $('inpCamberTip').value = v.camberTip;
  $('inpThickRoot').value = v.thickRoot;
  $('inpThickTip').value = v.thickTip;
  $('inpTEMin').value = v.teMin;
  $('chkBarrierRing').checked = v.barrierRing;
  $('inpRingThick').value = v.ringThick;
  $('inpShaftBore').value = v.shaftBore;
  $('inpHeatLoad').value = v.heatLoadW;
  $('inpDeltaT').value = v.deltaTAir;

  updateAll();
  viewer.setCameraView('iso', v.frameSize / 2);
}

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

document.querySelectorAll('.view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = readParams();
    viewer.setCameraView(btn.dataset.view, p.frameSize / 2);
  });
});

// Butang Eksport CAD & Mesh (Rotor)
$('btnExportBladeSTEP').addEventListener('click', () => requestSTEP('blade', 'Bilah'));
$('btnExportRotorSTEP').addEventListener('click', () => requestSTEP('rotor', 'Rotor'));

$('btnExportBladeSTL').addEventListener('click', () => {
  viewer.singleBladeGroup.updateMatrixWorld(true);
  const bin = new STLExporter().parse(viewer.singleBladeGroup, { binary: true });
  downloadBlob(new Blob([bin], { type: 'model/stl' }), `${getBaseName('Bilah')}.stl`);
});
$('btnExportRotorSTL').addEventListener('click', () => {
  viewer.rotorGroup.updateMatrixWorld(true);
  const bin = new STLExporter().parse(viewer.rotorGroup, { binary: true });
  downloadBlob(new Blob([bin], { type: 'model/stl' }), `${getBaseName('Rotor')}.stl`);
});
$('btnExportBladeOBJ').addEventListener('click', () => {
  viewer.singleBladeGroup.updateMatrixWorld(true);
  const txt = new OBJExporter().parse(viewer.singleBladeGroup);
  downloadBlob(new Blob([txt], { type: 'text/plain' }), `${getBaseName('Bilah')}.obj`);
});
$('btnExportRotorOBJ').addEventListener('click', () => {
  viewer.rotorGroup.updateMatrixWorld(true);
  const txt = new OBJExporter().parse(viewer.rotorGroup);
  downloadBlob(new Blob([txt], { type: 'text/plain' }), `${getBaseName('Rotor')}.obj`);
});

// Butang Eksport CAD & Mesh (Shroud / Stator)
$('btnExportShroudSTEP').addEventListener('click', () => requestSTEP('shroud', 'Shroud'));
$('btnExportShroudSTL').addEventListener('click', () => {
  viewer.frameVisualGroup.updateMatrixWorld(true);
  const bin = new STLExporter().parse(viewer.frameVisualGroup, { binary: true });
  downloadBlob(new Blob([bin], { type: 'model/stl' }), `${getBaseName('Shroud')}.stl`);
});

// Modal Rekod Parameter
$('btnSWFSSheet').addEventListener('click', () => {
  $('swfsContent').textContent = buildReportText('Rekod Parameter & Panduan SWFS/SLA');
  $('swfsModal').classList.remove('hidden');
  $('swfsModal').classList.add('flex');
});
$('btnCloseModal').addEventListener('click', () => {
  $('swfsModal').classList.add('hidden');
  $('swfsModal').classList.remove('flex');
});
$('btnCopySWFS').addEventListener('click', () => {
  navigator.clipboard.writeText($('swfsContent').textContent);
  $('btnCopySWFS').textContent = 'Disalin!';
  setTimeout(() => ($('btnCopySWFS').textContent = 'Salin Teks'), 1500);
});
$('btnDownloadSWFS').addEventListener('click', () => {
  downloadBlob(new Blob([$('swfsContent').textContent], { type: 'text/plain;charset=utf-8' }), `${getBaseName('Rotor')}_Params.txt`);
});

// Aktifkan plugin auto-muat turun _Params.txt
initParamExporter();

// Loop Animasi
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if ($('chkSpin').checked) {
    const rpm = Number($('inpRPM').value);
    const omega = (2 * Math.PI * rpm) / 60;
    viewer.rotorGroup.rotation.z += omega * dt * 0.04;
  }
  viewer.controls.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
}

// Mulakan dengan pratetap Hybrid 120mm
applyPreset('noctua120');
animate();
