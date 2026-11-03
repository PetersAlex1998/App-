import { Payment } from './types';

export type Source = 'manuell' | 'import';
export const sourceOf = (p: Pick<Payment, 'source'>): Source => p.source ?? 'manuell';
export const sourceLabel = (p: Pick<Payment, 'source'>) => (sourceOf(p) === 'import' ? 'Kontoauszug' : 'Manuell');
export const sourceLong = (p: Pick<Payment, 'source'>) => (sourceOf(p) === 'import' ? 'Aus Kontoauszug eingelesen' : 'Manuell erfasst');
export const sourceTone = (p: Pick<Payment, 'source'>) => (sourceOf(p) === 'import' ? ('primary' as const) : ('neutral' as const));

/** „03.11.2026, 14:35“ aus einem ISO-Zeitpunkt. */
export const stamp = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const kindText = (k: Payment['kind']) => ({ miete: 'Miete', kaution: 'Kaution', nachzahlung: 'NK-Nachzahlung' })[k];
