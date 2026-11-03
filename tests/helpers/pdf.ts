import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Liest den sichtbaren Text aus einem erzeugten PDF (Standardschrift, Hex-Zeichenketten) und liefert die einzelnen Textstücke. */
export async function pdfTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of('Type')) || obj.dict.get(PDFName.of('Subtype')) || obj.dict.get(PDFName.of('Length1'))) continue; // keine Seiteninhalte
    let text: string;
    try { text = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'); } catch { continue; }
    for (const m of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const hex = m[1];
      let s = '';
      for (let i = 0; i < hex.length; i += 2) {
        const b = parseInt(hex.slice(i, i + 2), 16);
        s += b === 0x80 ? '€' : b === 0x96 ? '–' : b === 0x84 ? '„' : b === 0x93 ? '“' : String.fromCharCode(b);
      }
      out.push(s);
    }
  }
  return out;
}
export const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
