// Enjin matematik aerodinamik skala kecil (Low Reynolds Number, Re_c < 10^5)

const RHO_AIR = 1.184;     // kg/m^3 pada ~25°C
const MU_AIR = 1.849e-5;   // Pa·s kelikatan dinamik udara
const CP_AIR = 1007;       // J/(kg·K) muatan haba tentu udara

export function getRadii(p) {
  const frameWall = p.frameSize <= 60 ? 2.0 : 2.5;
  const rTip = Math.max(12, p.frameSize / 2 - frameWall - p.tipClearance);
  const rHub = Math.max(5, rTip * p.hubRatio);
  const span = Math.max(4, rTip - rHub);
  return { rHub, rTip, span, frameWall };
}

// Kord dengan kawalan had ketebalan bingkai (frameDepth)
export function getChord(u, p, twistDeg) {
  const linear = p.rootChord * (1 + (p.taper - 1) * u);
  const bulge = p.rootChord * p.midBulge * Math.sin(Math.PI * u);
  let chord = Math.max(4, linear + bulge);

  // Kekangan paksi: pastikan bilah muat dalam frameDepth (tinggal 2.5mm kelegaan)
  const maxAxial = Math.max(6, p.frameDepth - 2.5);
  const sinT = Math.max(0.15, Math.sin((twistDeg * Math.PI) / 180));
  const maxAllowedChord = maxAxial / sinT;
  const clamped = chord > maxAllowedChord;
  if (clamped) chord = maxAllowedChord;

  return { chord, clamped };
}

// Lengkungan sapuan (Sweep) dalam mm (positif = arah putaran / forward sweep)
export function getSweep(u, p) {
  const uPos = Math.max(0, u);
  if (p.sweepMode === 'straight') return 0;
  if (p.sweepMode === 'forward') {
    // Sabit licin ke hadapan (scimitar)
    return p.sweepAmp * Math.pow(uPos, 1.55);
  }
  // 'progressive': Backward di pangkal (tolak zon mati hab), Forward di hujung
  return p.sweepAmp * (-0.45 * Math.sin(Math.PI * uPos) + 1.15 * Math.pow(uPos, 2.2));
}

// Analisis aerodinamik tempatan pada stesen jejari u ∈ [0, 1]
export function getStationAero(u, p) {
  const { rHub, rTip, span } = getRadii(p);
  const rMm = rHub + u * span;
  const rM = rMm / 1000;
  const omega = (2 * Math.PI * p.rpm) / 60;
  const U = omega * rM;
  const Vz = p.targetVz;
  const W = Math.hypot(U, Vz);

  const betaRad = Math.atan2(Vz, Math.max(0.05, U));
  const betaDeg = (betaRad * 180) / Math.PI;

  let twistDeg;
  if (p.autoTwist) {
    twistDeg = Math.min(72, Math.max(8, betaDeg + p.aoa));
  } else {
    twistDeg = p.rootTwist + (p.tipTwist - p.rootTwist) * u;
  }

  const aoaDeg = twistDeg - betaDeg;
  const { chord, clamped } = getChord(u, p, twistDeg);
  const chordM = chord / 1000;

  // Nombor Reynolds tempatan berasaskan kord
  const Re = (RHO_AIR * W * chordM) / MU_AIR;

  // Solidity tempatan σ = (Z * c) / (2 * π * r)
  const solidity = (p.blades * chord) / (2 * Math.PI * rMm);

  // Risiko stall lebih awal pada Re rendah (sekitar > 10° untuk thin airfoil)
  const stallRisk = aoaDeg > 10.5 || aoaDeg < -1.0;

  return {
    u, rMm, U, Vz, W, betaDeg, twistDeg, aoaDeg,
    chord, clamped, Re, solidity, stallRisk
  };
}

// Penjana koordinat 2D profil Thin Circular-Arc (Low-Re: tebal 3% - 6%)
// Mengembalikan titik tertutup dari TE -> permukaan atas -> LE -> permukaan bawah -> TE
export function generateThinAirfoil(chord, camberPct, thickPct, teMinMm, nPts = 28) {
  const f = (camberPct / 100) * chord;       // tinggi camber maksimum
  const tMax = Math.max(teMinMm, (thickPct / 100) * chord);
  const upper = [];
  const lower = [];

  for (let i = 0; i <= nPts; i++) {
    // Taburan kosinus supaya LE & TE lebih halus
    const beta = (i / nPts) * Math.PI;
    const xNorm = 0.5 * (1 - Math.cos(beta)); // 0 (LE) -> 1 (TE)
    const x = (xNorm - 0.5) * chord;          // pusat pada 50% kord

    // Garis camber parabola (hampiran tepat arka bulat untuk camber < 12%)
    const yc = 4 * f * xNorm * (1 - xNorm);
    const dycDx = 4 * (f / chord) * (1 - 2 * xNorm);
    const theta = Math.atan(dycDx);

    // Taburan ketebalan nipis dengan LE bulat dan TE terkawal (teMinMm)
    const ytBase = 0.5 * tMax * Math.sin(Math.PI * Math.pow(xNorm, 0.72));
    const yt = Math.max(ytBase, 0.5 * teMinMm * Math.pow(xNorm, 0.4));

    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    upper.push({ x: x - yt * sinT, y: yc + yt * cosT });
    lower.push({ x: x + yt * sinT, y: yc - yt * cosT });
  }

  // Susun sebagai gelung tertutup: TE(atas) -> LE -> TE(bawah)
  const loop = [];
  for (let i = nPts; i >= 0; i--) loop.push(upper[i]);
  for (let i = 1; i <= nPts; i++) loop.push(lower[i]);
  return loop;
}

// Ringkasan metrik global kipas (Aerodinamik, Aeroakustik & Pemindahan Haba)
export function getGlobalMetrics(p) {
  const { rHub, rTip, span } = getRadii(p);
  const R = rTip / 1000;
  const Rh = rHub / 1000;
  const area = Math.PI * (R * R - Rh * Rh);
  const omega = (2 * Math.PI * p.rpm) / 60;
  const uTip = omega * R;

  // Kadar aliran isipadu anggaran
  const flowM3s = area * p.targetVz;
  const flowCFM = flowM3s * 2118.88;
  const flowM3h = flowM3s * 3600;
  const phi = uTip > 0 ? p.targetVz / uTip : 0;

  // Blade Passing Frequency (Hz)
  const bpfHz = (p.blades * p.rpm) / 60;

  // Semakan stesen Root, Mid, Tip
  const root = getStationAero(0, p);
  const mid = getStationAero(0.5, p);
  const tip = getStationAero(1, p);
  const anyClamped = root.clamped || mid.clamped || tip.clamped;

  // Kalkulator Pemindahan Haba: Q_req = Q_heat / (rho * cp * dT)
  const reqFlowM3s = p.heatLoadW / (RHO_AIR * CP_AIR * Math.max(1, p.deltaTAir));
  const reqFlowCFM = reqFlowM3s * 2118.88;
  const thermalMarginPct = reqFlowM3s > 0 ? ((flowM3s - reqFlowM3s) / reqFlowM3s) * 100 : 0;

  // Ketebalan hab dipadankan dengan had bingkai
  const hubDepth = Math.min(p.frameDepth - 2.0, Math.max(10, p.frameDepth * 0.78));

  return {
    rHub, rTip, span,
    diameterMm: rTip * 2,
    hubDepth,
    omega, uTip,
    flowM3s, flowCFM, flowM3h,
    phi,
    bpfHz,
    reMid: mid.Re,
    solidityMid: mid.solidity,
    rootTwist: root.twistDeg,
    tipTwist: tip.twistDeg,
    anyClamped,
    reqFlowM3s, reqFlowCFM, thermalMarginPct
  };
}
