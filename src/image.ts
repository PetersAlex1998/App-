/** Logo wählen und verkleinern (nur Web). Liefert eine Data-URL oder null bei Abbruch. */
export function pickLogo(maxW = 520, maxH = 180): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const bmp = await createImageBitmap(f);
        const k = Math.min(1, maxW / bmp.width, maxH / bmp.height);
        const w = Math.max(1, Math.round(bmp.width * k));
        const h = Math.max(1, Math.round(bmp.height * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d')!;
        const png = f.type === 'image/png' || f.type === 'image/webp';
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(bmp, 0, 0, w, h);
        resolve(png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88));
      } catch (e) {
        reject(new Error('Das Bild konnte nicht gelesen werden.'));
      }
    };
    input.click();
  });
}
