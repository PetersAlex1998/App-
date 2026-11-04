/**
 * Form der schwebenden Tab-Leiste: ein Pillen-Rechteck, dessen Oberkante unter dem aktiven Symbol eine weiche Mulde bekommt.
 * Das aktive Symbol sitzt als Kugel in dieser Mulde. Reine Geometrie, damit sie testbar bleibt.
 */
export interface BarGeometry { width: number; height: number; depth: number; halfWidth: number; minWall?: number }

const cap = (x: number, w: number, r: number) => {
  // Abstand der Kontur von der Rechteckkante in den runden Enden (0 in der Mitte)
  const d = x < r ? r - x : x > w - r ? x - (w - r) : 0;
  return d > 0 ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0;
};
const bump = (u: number) => (Math.abs(u) >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * u)));

/** Obere und untere Kontur bei x (0 = Oberkante der Leiste). */
export function profile(x: number, cx: number, g: BarGeometry): { top: number; bottom: number } {
  const r = g.height / 2;
  const c = cap(x, g.width, r);
  const bottom = g.height - c;
  const dip = g.depth * bump((x - cx) / g.halfWidth);
  // Die Mulde darf den Boden nie durchstoßen, die Kappen ohne Mulde bleiben unverändert
  const top = dip > 0 ? Math.max(c, Math.min(c + dip, bottom - (g.minWall ?? 8))) : c;
  return { top, bottom };
}

/** SVG-Pfad der Leiste (Ursprung links oben an der Oberkante). `step` = Abtastabstand in px. */
export function barPath(cx: number, g: BarGeometry, step = 2): string {
  const xs: number[] = [];
  for (let x = 0; x < g.width; x += step) xs.push(x);
  xs.push(g.width);
  const top = xs.map((x) => `${x.toFixed(1)},${profile(x, cx, g).top.toFixed(1)}`);
  const bottom = [...xs].reverse().map((x) => `${x.toFixed(1)},${profile(x, cx, g).bottom.toFixed(1)}`);
  return `M${top.join(' L')} L${bottom.join(' L')} Z`;
}
