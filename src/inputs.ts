/** Eingabegrenzen für Felder: keine Buchstaben in Zahlenfeldern, keine überlangen Texte. */
export const MAX_TEXT = 500;
export const MAX_MULTILINE = 10000;
export const MAX_NUMBER_CHARS = 14;

/** Zahlenfeld: nur Ziffern, Komma, Punkt, Minus, Leerzeichen; höchstens 14 Zeichen. */
export const cleanNumeric = (v: string): string => v.replace(/[^\d.,\-\s]/g, '').slice(0, MAX_NUMBER_CHARS);

/** Obergrenzen, damit Tippfehler (eine Null zu viel) nicht unbemerkt in Auswertungen landen. */
export const MAX_MONEY = 10_000_000;
export const MAX_AREA = 10_000;
export const tooBig = (n: number, max = MAX_MONEY) => Math.abs(n) > max;
export const BIG_MONEY = 'Der Betrag ist zu groß. Bitte prüfen, ob ein Zahlendreher oder eine Null zu viel drin ist.';
