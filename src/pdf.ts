import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Briefbogen nach DIN 5008 Form B (A4). Maße in mm, damit Fenster, Falz- und Lochmarken passen.
export const LETTER_CSS = `<style>
@page{size:A4;margin:0}
html,body{margin:0;padding:0}
body{font-family:Helvetica,Arial,sans-serif;color:#111;font-size:10.5pt;line-height:1.35}
h1{font-size:13pt;margin:0 0 5mm}
p{margin:0 0 3.5mm}
table{width:100%;border-collapse:collapse;margin:4mm 0;font-size:9.5pt}
td,th{border-bottom:.3pt solid #bbb;padding:1.6mm 1.5mm;text-align:left;vertical-align:top}
td.r,th.r{text-align:right}
.sum{font-weight:bold}.small{color:#555;font-size:8pt}
.page{position:relative;width:210mm;min-height:297mm;box-sizing:border-box;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.head{position:absolute;top:10mm;left:25mm;right:20mm;height:32mm}
.ret{position:absolute;top:57mm;left:20mm;width:85mm;height:4.5mm;font-size:7pt;color:#444;border-bottom:.3pt solid #888;white-space:nowrap;overflow:hidden}
.addr{position:absolute;top:62.7mm;left:20mm;width:85mm;height:27.3mm;font-size:10.5pt;line-height:4.5mm;overflow:hidden}
.info{position:absolute;top:50mm;left:125mm;width:75mm;font-size:9pt;line-height:1.5;color:#333}
.main{box-sizing:border-box;padding:20mm 20mm 25mm 25mm;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.spacer{height:78.5mm}
.mark{position:absolute;left:0;width:5mm;height:0;border-top:.4pt solid #555}.mark.loch{width:8mm}
.foot{position:absolute;bottom:10mm;left:25mm;right:20mm;padding-top:2.5mm;border-top:.3pt solid #bbb;color:#555;font-size:7.5pt;line-height:1.45;text-align:center}
</style>`;

export async function exportPdf(html: string) {
  const doc = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">${LETTER_CSS}</head><body>${html}</body></html>`;
  if (Platform.OS === 'web') {
    await Print.printAsync({ html: doc });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html: doc, width: 595, height: 842, margins: { left: 0, top: 0, right: 0, bottom: 0 } });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

export { nkHtml, reminderHtml, sampleLetterHtml } from './letters';
