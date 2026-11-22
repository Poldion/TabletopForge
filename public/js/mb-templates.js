// Kartenbauer: Schnellstart-Vorlagen und das Sichern/Laden einer Szene als Datei.
// Die Vorlagen sind gewöhnliche Szenen (public/mb-templates/<id>.json) – nach dem Laden frei bearbeitbar.
import { h, uid, prompt2 } from './util.js';
import { ai } from './ai.js';
import { tr } from './i18n.js';
import { freshIds, cleanScene } from './mb-geom.js';
import { CATALOG } from './mb-assets.js';

export const TEMPLATES = [
  { id: 'tavern', label: tr('Taverne am See'), hint: tr('Schankraum, Küche, Kammer und Rundturm; draußen Wald, Fels und Ufer') },
  { id: 'crypt', label: tr('Gruft'), hint: tr('Grabkammer, Ritualhalle, Schatzkammer und Verlies, durch Gänge verbunden') },
  { id: 'cave', label: tr('Höhle'), hint: tr('Natürliche Kavernen mit Engstellen, Tümpel und Lagerplatz') },
  { id: 'ruin', label: tr('Ruine im Grünen'), hint: tr('Verfallenes Gemäuer mit Rundturm, überwuchert, am Weg') },
  { id: 'village', label: tr('Dorf am Fluss'), hint: tr('Übersichtskarte: Häuser, Kirche, Mühle, Felder, Brücke') },
  { id: 'city', label: tr('Stadt am Fluss'), hint: tr('Große Übersichtskarte (80 × 45): Stadtmauer mit Toren, Viertel, Markt, Zitadelle, Hafen') },
  { id: 'fortress', label: tr('Festung auf dem Hügel'), hint: tr('Große Übersichtskarte (60 × 40): Vorburg und Kernburg auf zwei Geländestufen, Graben, Zufahrt') },
];

// Vorlage, die der Kartenbauer beim Öffnen einer neuen Karte übernimmt (Karte → Szene)
const pending = new Map();
export const takeTemplate = (mapId) => {
  const scene = pending.get(mapId);
  pending.delete(mapId);
  return scene || null;
};

/** Szene einer Vorlage laden – mit eigenen Kennungen und eigenem Zufallsstart. */
export async function loadTemplate(id) {
  const res = await fetch(`/mb-templates/${id}.json`);
  if (!res.ok) throw new Error(tr('Vorlage nicht gefunden'));
  return prepare(await res.json());
}

/** Fremde Szene (Vorlage oder Datei) für diese Karte herrichten; wirft, wenn es keine Szene ist. */
export function prepare(raw) {
  const scene = cleanScene(raw, (t) => !!CATALOG[t]);
  if (!scene) throw new Error(tr('Das ist keine Kartenbauer-Szene.'));
  return freshIds(scene, uid);
}

/** Vorlage für eine neue Karte vormerken; der Kartenbauer holt sie beim Öffnen ab. */
export async function reserveTemplate(mapId, id) {
  // „ai:<Wunsch>“: der Kartenbauer lässt die Karte beim Öffnen vom Sprachmodell entwerfen
  if (id.startsWith('ai:')) wishes.set(mapId, id.slice(3));
  else pending.set(mapId, await loadTemplate(id));
}
// Wunsch für eine Karte, die das Sprachmodell entwerfen soll (Karte → Beschreibung)
const wishes = new Map();
export const takeWish = (mapId) => {
  const w = wishes.get(mapId);
  wishes.delete(mapId);
  return w || null;
};

/**
 * Auswahl: leere Karte, eine Vorlage oder (mit eingerichtetem Sprachmodell) ein Entwurf der KI. Liefert '' (leer), die
 * Kennung der Vorlage, 'ai:<Wunsch>' oder null (abgebrochen).
 */
export function pickTemplate() {
  return new Promise((resolve) => {
    const card = (id, label, hint, img) =>
      h('button.mb-tpl', { type: 'button', onclick: () => dlg.close(`pick:${id}`) }, img ? h('img', { src: img, alt: '', loading: 'lazy' }) : h('div.mb-tpl-empty', id === 'ai' ? '✦' : '+'), h('strong', label), h('span.small.muted', hint));
    const dlg = h(
      'dialog.modal.mb-tpl-dialog',
      h('h3', tr('Womit beginnen?')),
      h('div.mb-tpls', card('', tr('Leere Karte'), tr('Wiese, 28 × 16 Felder – alles selbst bauen')), ai.text ? card('ai', tr('Von der KI entwerfen lassen'), tr('Beschreibe, was die Karte zeigen soll – Räume, Einrichtung und Gelände entstehen als Entwurf zum Weiterbauen')) : null, TEMPLATES.map((t) => card(t.id, t.label, t.hint, `/mb-templates/${t.id}.webp`))),
      h('p.small.muted', tr('Eine Vorlage ist nur der Anfang: Umgebung, Räume und Einrichtung lassen sich danach frei ändern.')),
      h('div.row.end', h('button', { type: 'button', onclick: () => dlg.close('cancel') }, tr('Abbrechen'))),
    );
    dlg.addEventListener('close', async () => {
      const pick = dlg.returnValue.startsWith('pick:') ? dlg.returnValue.slice(5) : null;
      dlg.remove();
      if (pick !== 'ai') return resolve(pick);
      const wish = await askWish();
      resolve(wish ? `ai:${wish}` : null);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Fragt, was die KI bauen soll. Liefert die Beschreibung oder null. */
export const askWish = () => prompt2(tr('Was soll die Karte zeigen? (z. B. „Wachturm an einer Furt, daneben ein Lager“)'));

/** Szene als Datei herunterladen. */
export function downloadScene(scene, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(scene)], { type: 'application/json' })), download: `${(name || 'karte').replace(/[\\/:*?"<>|]+/g, '_')}.karte.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

/** Szene aus einer Datei wählen und herrichten; liefert die Szene oder null (abgebrochen). Wirft bei falscher Datei. */
export function uploadScene() {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      try {
        resolve(prepare(JSON.parse(await file.text())));
      } catch (err) {
        reject(err instanceof SyntaxError ? new Error(tr('Das ist keine Kartenbauer-Szene.')) : err);
      }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
