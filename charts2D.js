// Lukisan 2D Profil Thin Circular-Arc & Segi Tiga Halaju (U, Vz, W)
import { getStationAero, generateThinAirfoil } from './aeroMath.js';

export function drawCharts2D(p, stationU, canvasAirfoil, canvasTriangle, badgeEl) {
  const st = getStationAero(stationU, p);
  const camber = p.camberRoot + (p.camberTip - p.camberRoot) * stationU;
  const thick = p.thickRoot + (p.thickTip - p.thickRoot) * stationU;

  // Kemas kini lencana amaran Stall / Low-Re
  if (badgeEl) {
    if (st.stallRisk) {
      badgeEl.textContent = `⚠ RISIKO STALL (α=${st.aoaDeg.toFixed(1)}°)`;
      badgeEl.className = 'rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700';
    } else {
      badgeEl.textContent = `Re = ${(st.Re / 1000).toFixed(1)}k | α = ${st.aoaDeg.toFixed(1)}°`;
      badgeEl.className = 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700';
    }
  }

  // 1. Kanvas Profil Aerofoil Nipis
  if (canvasAirfoil) {
    const ctx = canvasAirfoil.getContext('2d');
    const W = canvasAirfoil.width;
    const H = canvasAirfoil.height;
    ctx.clearRect(0, 0, W, H);

    const pts = generateThinAirfoil(st.chord, camber, thick, p.teMin, 30);
    const scale = (W * 0.72) / Math.max(10, st.chord);
    const cx = W * 0.5;
    const cy = H * 0.56;

    // Garisan kord
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - (st.chord * 0.5) * scale, cy);
    ctx.lineTo(cx + (st.chord * 0.5) * scale, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bentuk profil
    ctx.fillStyle = '#bae6fd';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((pt, idx) => {
      const px = cx + pt.x * scale;
      const py = cy - pt.y * scale;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText(`c = ${st.chord.toFixed(1)} mm  |  t/c = ${thick.toFixed(1)}%  |  camber = ${camber.toFixed(1)}%`, 10, H - 8);
  }

  // 2. Kanvas Segi Tiga Halaju (U, Vz, W)
  if (canvasTriangle) {
    const ctx = canvasTriangle.getContext('2d');
    const W = canvasTriangle.width;
    const H = canvasTriangle.height;
    ctx.clearRect(0, 0, W, H);

    const maxV = Math.max(st.U, st.Vz, 2);
    const scale = Math.min((W - 60) / Math.max(1, st.U), (H - 50) / Math.max(1, st.Vz), 18);
    const x0 = 28;
    const y0 = H - 26;
    const xU = x0 + st.U * scale;
    const yVz = y0 - st.Vz * scale;

    const drawArrow = (x1, y1, x2, y2, color, label, lx, ly) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 7 * Math.cos(ang - 0.4), y2 - 7 * Math.sin(ang - 0.4));
      ctx.lineTo(x2 - 7 * Math.cos(ang + 0.4), y2 - 7 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();

      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(label, lx, ly);
    };

    drawArrow(x0, y0, xU, y0, '#0284c7', `U = ${st.U.toFixed(1)} m/s`, (x0 + xU) / 2 - 24, y0 + 14);
    drawArrow(xU, y0, xU, yVz, '#059669', `Vz = ${st.Vz.toFixed(1)}`, Math.min(W - 55, xU + 5), (y0 + yVz) / 2);
    drawArrow(x0, y0, xU, yVz, '#4f46e5', `W = ${st.W.toFixed(1)}`, (x0 + xU) / 2 - 36, (y0 + yVz) / 2 - 6);

    ctx.fillStyle = '#475569';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(`β = ${st.betaDeg.toFixed(1)}°  |  Twist = ${st.twistDeg.toFixed(1)}°`, 10, 14);
  }
}
