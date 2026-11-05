/**
 * Schutz vor „CSV-Injection“: Beginnt eine Zelle mit = + - @ (oder Tab/Zeilenumbruch), führt Excel sie als Formel aus.
 * Ein Lieferantenname wie „=HYPERLINK(…)“ könnte so beim Öffnen des Exports etwas auslösen.
 * Textzellen bekommen deshalb ein Apostroph vorangestellt. Für Zahlen nicht verwenden.
 */
export const csvSafe = (v: string | number): string => {
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Eine Textzelle für CSV (Semikolon-Format): gegen Formeln gesichert und in Anführungszeichen. */
export const csvText = (v: string | number): string => `"${csvSafe(v).replace(/"/g, '""')}"`;
