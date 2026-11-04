import { useStore, uid } from './store';
import { useSettings } from './settings';
import { confirm, notify } from './ui';
import { eur, nkStatement, reminderLabel, today } from './calc';
import { exportPdf, nkHtml, reminderHtml } from './pdf';
import { nkModel, reminderModel } from './letters';
import { storeLetters } from './outbox';
import { filesSupported } from './files';
import { dunningPlans, makeReminder, overdueItems, relevantReminders } from './dunning';
import { Tenant } from './types';

/**
 * Aktionen rund um einen Mieter, die Mieterseite und Wohnungsseite gemeinsam nutzen:
 * Mahnung erstellen und Nebenkostenabrechnung erstellen. Beides legt den Brief als PDF im Briefausgang ab.
 */
export function useTenantActions(tenant: Tenant | undefined, navigation: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const unit = tenant ? db.units.find((u) => u.id === tenant.unitId) : undefined;
  const prop = unit ? db.properties.find((p) => p.id === unit.propertyId) : undefined;
  const ended = !!tenant?.moveOut && tenant.moveOut < today();
  const dueNow = tenant ? overdueItems(db, tenant, cfg) : [];
  const plan = tenant && !ended ? dunningPlans(db, cfg).find((p) => p.tenant.id === tenant.id) : undefined;
  const nextLevel = tenant ? (Math.min(3, relevantReminders(db, tenant, dueNow).length + 1) as 1 | 2 | 3) : 1;

  const createReminder = () => {
    if (!tenant || !unit || !prop) return;
    if (!plan) return notify('Aktuell ist keine Miete überfällig. Die Miete des laufenden Monats gilt erst nach Fälligkeit und Karenz als überfällig.');
    confirm(`${reminderLabel(plan.level)} erstellen?`, async () => {
      const r = makeReminder(uid(), plan, cfg);
      save('reminders', r);
      if (filesSupported()) {
        const [doc] = await storeLetters([{ model: reminderModel(db, r, tenant, unit, prop, cfg), tenant, note: `Mahnung Stufe ${r.level}` }]);
        save('documents', doc);
        navigation.navigate('Outbox');
        return;
      }
      await exportPdf(reminderHtml(db, r, tenant, unit, prop, cfg));
    }, 'Erstellen', `Überfällig: ${eur(plan.open)}${plan.fee ? ` · Mahngebühr ${eur(plan.fee)}` : ''}. Frist: ${cfg.deadlineDays} Tage. Der Brief liegt danach als PDF im Briefausgang.`);
  };

  const createNk = async (year: number) => {
    if (!tenant || !unit || !prop) return;
    const nk = nkStatement(db, tenant, unit, year);
    if (nk.lines.length === 0) return notify(`Für ${year} sind noch keine Betriebskosten erfasst. Trage sie im Objekt ein.`);
    save('tenants', { ...tenant, nkDone: { ...(tenant.nkDone ?? {}), [String(year)]: today() } });
    if (filesSupported()) {
      const [doc] = await storeLetters([{ model: nkModel(nk, tenant, unit, prop, year, cfg), tenant, note: `Nebenkosten ${year}` }]);
      save('documents', doc);
      navigation.navigate('Outbox');
      return;
    }
    await exportPdf(nkHtml(nk, tenant, unit, prop, year, cfg));
  };

  return { unit, prop, plan, dueNow, nextLevel, ended, createReminder, createNk };
}
