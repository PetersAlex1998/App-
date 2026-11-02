import { DocCategory, DocOwner } from './types';

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  energieausweis: 'Energieausweis', mietvertrag: 'Mietvertrag', foto: 'Foto', versicherung: 'Versicherung', grundbuch: 'Grundbuch',
  rechnung: 'Rechnung', protokoll: 'Protokoll', brief: 'Brief', sonstiges: 'Sonstiges',
};
export const CATEGORY_ICON: Record<DocCategory, 'leaf'> = {
  energieausweis: 'leaf', mietvertrag: 'document-text', foto: 'image', versicherung: 'shield-checkmark', grundbuch: 'book',
  rechnung: 'receipt', protokoll: 'clipboard', brief: 'mail', sonstiges: 'document-attach',
} as never;
export const CATEGORIES_FOR: Record<DocOwner, DocCategory[]> = {
  property: ['energieausweis', 'foto', 'versicherung', 'grundbuch', 'rechnung', 'sonstiges'],
  unit: ['foto', 'protokoll', 'rechnung', 'sonstiges'],
  tenant: ['mietvertrag', 'protokoll', 'foto', 'rechnung', 'brief', 'sonstiges'],
};
/** Kategorien, bei denen ein Ablaufdatum Sinn ergibt. */
export const HAS_EXPIRY: DocCategory[] = ['energieausweis', 'versicherung', 'mietvertrag', 'sonstiges'];

export const daysUntil = (iso: string, now = new Date().toISOString().slice(0, 10)) =>
  Math.round((Date.parse(iso) - Date.parse(now)) / 86400000);
/** Ablaufstatus für Badges: abgelaufen, bald (<= 180 Tage), ok. */
export function expiryState(iso?: string): { tone: 'danger' | 'warn' | 'ok'; text: string } | null {
  if (!iso) return null;
  const d = daysUntil(iso);
  if (d < 0) return { tone: 'danger', text: `Abgelaufen seit ${-d} Tagen` };
  if (d <= 180) return { tone: 'warn', text: `Läuft in ${d} Tagen ab` };
  return { tone: 'ok', text: 'Gültig' };
}
