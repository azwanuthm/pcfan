// Plugin eksport rekod parameter & panduan SWFS/3D Print (.txt)

function getVal(id, fallback = '-') {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function getChecked(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function getText(id, fallback = '-') {
  const el = document.getElementById(id);
  return el ? el.textContent.trim() : fallback;
}

export function buildReportText(exportType = 'Panduan SWFS & Rekod Parameter') {
  const frameSize = Number(getVal('selFrameSize', 120));
  const frameDepth = Number(getVal('selFrameDepth', 25));
  const rpm = Number(getVal('inpRPM', 1800));
  const omega = ((2 * Math.PI * rpm) / 60).toFixed(2);
  const autoTwist = getChecked('chkAutoTwist');
  const barrierRing = getChecked('chkBarrierRing');
  const timestamp = new Date().toLocaleString('ms-MY');

  return `=== REKOD PARAMETER KIPAS PAKSI SKALA KECIL (PC / ELEKTRONIK) ===
Tarikh / Masa : ${timestamp}
Jenis Eksport : ${exportType}

1. PIAWAIAN BINGKAI & DIMENSI UTAMA
   - Saiz Bingkai (Frame) : ${frameSize} x ${frameSize} x ${frameDepth} mm
   - Kelegaan Hujung (Tip): ${getVal('inpTipClearance')} mm
   - Nisbah Hab (dh/dt)   : ${getVal('inpHubRatio')}
   - Bilangan Bilah (Z)   : ${getVal('inpBlades')}
   - Diameter Rotor Luar  : ${getText('outDiameter')}
   - Lubang Aci (Bore)    : ${getVal('inpShaftBore')} mm
   - Barrier Ring (GPU)   : ${barrierRing ? `Aktif (Tebal ${getVal('inpRingThick')} mm)` : 'Tidak Aktif'}

2. TITIK OPERASI & AERODINAMIK (LOW-Re)
   - Kelajuan Motor (RPM) : ${rpm} rpm  (ω = ${omega} rad/s)
   - Sasaran Halaju (Vz)  : ${getVal('inpVz')} m/s
   - Mod Twist            : ${autoTwist ? `Auto-Twist Free Vortex (AoA = ${getVal('inpAoA')}°)` : `Manual (${getVal('inpRootTwist')}° -> ${getVal('inpTipTwist')}°)`}
   - Sudut Root -> Tip    : ${getText('outTwistRange')}
   - Nombor Reynolds (Mid): ${getText('outReMid')}
   - Solidity (Mid-Span)  : ${getText('outSolidity')}

3. PROFIL BILAH NIPIS (THIN CIRCULAR-ARC)
   - Kord Pangkal (Root)  : ${getVal('inpRootChord')} mm
   - Kembangan (Taper)    : ${getVal('inpTaper')} x
   - Mid-Bulge            : ${getVal('inpMidBulge')} x
   - Sapuan (Sweep)       : ${getVal('inpSweepAmp')} mm  (Mod: ${getVal('selSweepMode')})
   - Camber (Root -> Tip) : ${getVal('inpCamberRoot')}% -> ${getVal('inpCamberTip')}%
   - Tebal (Root -> Tip)  : ${getVal('inpThickRoot')}% -> ${getVal('inpThickTip')}%
   - Tebal Min. TE        : ${getVal('inpTEMin')} mm

4. PRESTASI, AEROAKUSTIK & BEBAN HABA
   - Kadar Aliran (Q)     : ${getText('outFlowCFM')} (${getText('outFlowM3h')})
   - Laju Hujung (Utip)   : ${getText('outTipSpeed')}
   - Frekuensi BPF (Hz)   : ${getText('outBPF')}
   - Beban Haba Sasaran   : ${getVal('inpHeatLoad')} W  (ΔT udara = ${getVal('inpDeltaT')} °C)
   - Aliran Diperlukan    : ${getText('outReqFlow')}  |  Margin: ${getText('outThermalMargin')}

5. PANDUAN RINGKAS SWFS & CETAKAN 3D (SLA)
   - Unit Fail STEP/STL   : Milimeter (mm)
   - Rotating Region SWFS : Local Region (Averaging/Sliding), ω = ${omega} rad/s
   - Cadangan Cetakan 3D  : Guna Resin SLA (Tough/Engineering Resin), TE >= 0.5 mm,
                            Tip Clearance >= 0.8 mm, dan lakukan imbangan statik (balancing).`;
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initParamExporter() {
  const buttons = [
    { id: 'btnExportBladeSTEP', prefix: 'Bilah', label: 'STEP (Satu Bilah)' },
    { id: 'btnExportRotorSTEP', prefix: 'Rotor', label: 'STEP (Rotor Lengkap)' },
    { id: 'btnExportBladeSTL',  prefix: 'Bilah', label: 'STL (Satu Bilah)' },
    { id: 'btnExportRotorSTL',  prefix: 'Rotor', label: 'STL (Rotor Lengkap)' },
    { id: 'btnExportBladeOBJ',  prefix: 'Bilah', label: 'OBJ (Satu Bilah)' },
    { id: 'btnExportRotorOBJ',  prefix: 'Rotor', label: 'OBJ (Rotor Lengkap)' }
  ];

  buttons.forEach(({ id, prefix, label }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        const size = getVal('selFrameSize', '120');
        const depth = getVal('selFrameDepth', '25');
        const blades = getVal('inpBlades', '7');
        const rpm = getVal('inpRPM', '1800');
        const filename = `${prefix}_${size}x${depth}mm_${blades}B_${rpm}rpm_Params.txt`;
        setTimeout(() => downloadTextFile(buildReportText(label), filename), 300);
      });
    }
  });
}
