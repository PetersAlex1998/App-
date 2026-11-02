import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const css = `<style>body{font-family:Helvetica,Arial,sans-serif;padding:40px;color:#111;font-size:13px}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}
td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}td.r,th.r{text-align:right}
.sum{font-weight:bold}.small{color:#555;font-size:11px}.page{page-break-after:always;min-height:95vh;display:flex;flex-direction:column}.foot{margin-top:auto;padding-top:14px;border-top:1px solid #bbb;color:#555;font-size:10px;line-height:1.5;text-align:center}.page:last-child{page-break-after:auto}</style>`;

export async function exportPdf(html: string) {
  const doc = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">${css}</head><body>${html}</body></html>`;
  if (Platform.OS === 'web') {
    await Print.printAsync({ html: doc });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html: doc });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

export { nkHtml, reminderHtml, sampleLetterHtml } from './letters';
