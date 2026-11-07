import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { bboxOfAlpha } from './signature';
import { Button, useColors } from './ui';
import { type } from './theme';

export interface PadHandle { isEmpty: () => boolean; clear: () => void; toDataUrl: () => string | null }
type Pt = { x: number; y: number };

/**
 * Zeichenfläche für die Unterschrift mit Finger oder Stift (Browser/Handy). Die Zeichnung wird als PNG mit transparentem Hintergrund
 * zugeschnitten ausgegeben. Der Seitenlauf wird beim Zeichnen gesperrt (touch-action: none).
 */
export const SignaturePad = forwardRef<PadHandle, { label: string; height?: number; onChange?: (empty: boolean) => void }>(function SignaturePad({ label, height = 180, onChange }, ref) {
  const c = useColors();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Pt[][]>([]);
  const cur = useRef<Pt[] | null>(null);
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const cv = canvas.current; const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = cv.width / Math.max(1, cv.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
    ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, 1.4, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length - 1; i++) { const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2; ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my); }
      ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    }
  }, []);

  const setSize = useCallback(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setSize();
    window.addEventListener('resize', setSize);
    return () => window.removeEventListener('resize', setSize);
  }, [setSize]);

  const update = () => { const e = strokes.current.length === 0; setEmpty(e); onChange?.(e); };
  const point = (ev: PointerEvent | React.PointerEvent): Pt => { const r = canvas.current!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const down = (ev: React.PointerEvent) => {
    ev.preventDefault();
    canvas.current?.setPointerCapture?.(ev.pointerId);
    cur.current = [point(ev)]; strokes.current.push(cur.current); redraw(); update();
  };
  const move = (ev: React.PointerEvent) => { if (!cur.current) return; ev.preventDefault(); cur.current.push(point(ev)); redraw(); };
  const up = () => { cur.current = null; };

  const clear = () => { strokes.current = []; cur.current = null; redraw(); update(); };
  const undo = () => { strokes.current.pop(); redraw(); update(); };

  useImperativeHandle(ref, () => ({
    isEmpty: () => strokes.current.length === 0,
    clear,
    toDataUrl: () => {
      const cv = canvas.current; const ctx = cv?.getContext('2d');
      if (!cv || !ctx || strokes.current.length === 0) return null;
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const box = bboxOfAlpha(img.data, cv.width, cv.height);
      if (!box) return null;
      const pad = Math.round(6 * (cv.width / Math.max(1, cv.clientWidth)));
      const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
      const w = Math.min(cv.width - x, box.w + pad * 2), h = Math.min(cv.height - y, box.h + pad * 2);
      const k = Math.min(1, 700 / w);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
      out.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }), [redraw]);

  if (Platform.OS !== 'web') return <Text style={{ color: c.muted, fontSize: type.subhead }}>Unterschreiben ist in der Web-App verfügbar.</Text>;
  return (
    <View>
      {React.createElement('canvas', {
        ref: canvas, role: 'img', 'aria-label': `Unterschriftsfeld ${label}`, 'data-testid': 'signature-pad',
        onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onPointerLeave: up,
        style: { width: '100%', height, background: '#fff', border: `1.5px dashed ${c.muted}`, borderRadius: 14, touchAction: 'none', cursor: 'crosshair', display: 'block' },
      })}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 34, borderBottomWidth: 1, borderBottomColor: '#bbb', pointerEvents: 'none' }} />
      {empty && <Text style={{ position: 'absolute', left: 0, right: 0, top: height / 2 - 12, textAlign: 'center', color: '#999', fontSize: type.body, pointerEvents: 'none' }}>Hier mit dem Finger unterschreiben</Text>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button kind="secondary" icon="arrow-undo-outline" title="Rückgängig" onPress={undo} disabled={empty} /></View>
        <View style={{ flex: 1 }}><Button kind="secondary" icon="trash-outline" title="Löschen" onPress={clear} disabled={empty} /></View>
      </View>
    </View>
  );
});
