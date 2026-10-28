// Wiederverwendbare UI-Bausteine für Vorbereitung und Spielleitung.
import { h, fileUrl, uploadFiles, toast, uid } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';

export const MAP_KINDS = {
  battle: tr('Kampfkarte'),
  location: tr('Ortskarte'),
  world: 'Reise-/Weltkarte',
};

/** Vorschaubild eines Assets bzw. einer Karte. */
export function thumb(campaignId, asset, { caption, badge, selected, live, onclick, title } = {}) {
  const isImg = asset?.kind === 'image';
  return h(
    'div.thumb',
    { class: [selected && 'selected', live && 'live'].filter(Boolean).join(' '), onclick, title: title || caption || asset?.name },
    isImg ? h('img', { src: fileUrl(campaignId, asset), loading: 'lazy', alt: '' }) : icon('file', { size: 34 }),
    badge ? h('span.badge', badge) : null,
    h('div.cap', caption ?? asset?.name ?? '—'),
  );
}

/** Upload-Fläche mit Drag & Drop und Dateiauswahl. */
export function dropzone(campaignId, { accept = 'image/*,application/pdf', onUploaded, label } = {}) {
  const input = h('input', { type: 'file', multiple: true, accept, class: 'hidden' });
  const zone = h(
    'div.dropzone',
    h('div', label || tr('Dateien hierher ziehen oder ')),
    h('button', { type: 'button', onclick: () => input.click(), style: { marginTop: '8px' } }, tr('Dateien auswählen')),
    input,
  );
  const send = async (files) => {
    if (!files?.length) return;
    zone.classList.add('over');
    try {
      const created = await uploadFiles(campaignId, files);
      toast(tr('{length} Datei(en) hochgeladen', { length: created.length }));
      onUploaded?.(created);
    } catch (err) {
      toast(tr('Upload fehlgeschlagen: {message}', { message: err.message }));
    } finally {
      zone.classList.remove('over');
    }
  };
  input.addEventListener('change', () => send([...input.files]).then(() => (input.value = '')));
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    send([...e.dataTransfer.files]);
  });
  return zone;
}

/** Erzeugt eine neue Karte aus einem Bild-Asset. */
export function newMap(asset, kind = 'battle') {
  return {
    id: uid(),
    name: asset.name,
    kind,
    assetId: asset.id,
    createdAt: Date.now(),
    grid: { size: 70, offsetX: 0, offsetY: 0, feet: 5, show: kind === 'battle', color: '#000000', opacity: 0.35 },
    fog: { enabled: kind === 'world', ops: [] },
    lighting: { enabled: false, ambient: 0.15 },
    tokens: {},
    lights: {},
    aoes: {},
    drawings: {},
    notes: '',
  };
}

export const statusLabel = { planned: tr('Geplant'), active: tr('Läuft'), done: tr('Gespielt') };

// --- Porträts und Tokens: gehören zur Figur, nicht automatisch zu den Handouts ---------------------------

/** IDs aller Bilder, die als Porträt oder Token einer Kreatur bzw. eines Charakters dienen. */
export function characterImageIds(st) {
  const ids = new Set();
  for (const c of Object.values(st?.creatures || {})) for (const k of ['portraitAssetId', 'tokenAssetId']) if (c[k]) ids.add(c[k]);
  for (const m of st?.party?.members || []) for (const k of ['portraitAssetId', 'tokenAssetId']) if (m[k]) ids.add(m[k]);
  return ids;
}

/**
 * Gehört die Datei zu den Handouts? Porträts und Tokens (zugeordnet oder als solche erzeugt) nur, wenn ausdrücklich
 * „In Handouts“ gewählt ist. ids: characterImageIds(st), bei vielen Abfragen einmal vorher berechnen.
 */
export const isHandout = (st, a, ids = characterImageIds(st)) => !!a && (a.handout === true || (!a.use && !ids.has(a.id)));

/**
 * Bilder einer Figur (Porträt, Token) im Bogen: groß anzeigen, den Spielern zeigen, optional in die Handouts.
 * images: [[Beschriftung, assetId], …]
 */
export function figureImages(sync, cid, images, caption) {
  const st = sync.state;
  const list = images.filter(([, id]) => id && st.assets[id]);
  if (!list.length) return null;
  return h(
    'div.figure-images',
    list.map(([label, id]) => {
      const a = st.assets[id];
      const inHandouts = a.handout === true;
      return h(
        'div.figure-image',
        h('img', { src: fileUrl(cid, a), alt: label, class: label === tr('Token') ? 'token' : '' }),
        h('div.small.muted', label),
        h(
          'div.row',
          { style: { gap: '4px', justifyContent: 'center', flexWrap: 'wrap' } },
          h('button.small', { title: tr('Auf dem Spieler-Display zeigen'), onclick: () => (sync.merge(['display', 'player'], { mode: 'image', assetId: id, caption }), toast(tr('Auf dem Spieler-Display'))) }, icon('image')),
          h('button.small', { class: inHandouts ? 'active' : '', title: inHandouts ? tr('Aus den Handouts nehmen') : tr('Auch bei den Handouts zeigen'), onclick: () => sync.set(['assets', id, 'handout'], !inHandouts) }, icon('file'), inHandouts ? tr(' in Handouts') : tr(' In Handouts')),
        ),
      );
    }),
  );
}
