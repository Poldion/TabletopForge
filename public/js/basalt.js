// BasaltNotes in der Oberfläche: Charakter-Notizen anzeigen, verknüpfen und übernehmen. Nur wenn unter „Dienste“
// eingerichtet (basalt.enabled) – sonst erscheint nichts davon.
import { h, fill, api, toast } from './util.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';

export const basalt = { enabled: false, url: '', vault: '', rulesVault: '' };

let loading = null;
export const loadBasalt = () =>
  (loading ||= api('GET', '/api/basalt')
    .then((s) => Object.assign(basalt, s))
    .catch(() => basalt));

/** Kampagne in BasaltNotes: eingestellt, sonst gleichnamig. */
export const basaltCampaign = (st) => st.basalt?.campaign || st.name;
/** Vault der Kampagne: eingestellt, sonst der Standard-Vault aus den Diensten. */
export const basaltVault = (st) => st.basalt?.vault || basalt.vault;

/**
 * HTML einer Notiz sicher einfügen: ohne Skripte, Einbettungen und Ereignis-Attribute; Links öffnen BasaltNotes in
 * einem neuen Tab. (BasaltNotes liefert schon bereinigtes HTML – das hier ist die zweite Absicherung.)
 */
export function basaltHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  root.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta').forEach((el) => el.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'src') && (v.startsWith('javascript:') || v.startsWith('data:text')))) el.removeAttribute(a.name);
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    }
  }
  const out = h('div.md.basalt-note');
  out.append(...root.childNodes);
  return out;
}

/**
 * Dialog: Charaktere der Basalt-Kampagne auswählen. exclude: bereits verknüpfte Notiz-IDs.
 * multi: mehrere wählbar. onPick(liste) mit { id, title, frontmatter }.
 */
export async function pickBasaltCharacter(sync, { exclude = [], multi = false, onPick }) {
  const campaign = basaltCampaign(sync.state);
  const vault = basaltVault(sync.state);
  const listEl = h('div.list', h('p.small.muted', tr('Lädt …')));
  const chosen = new Set();
  const ok = h('button.primary', { type: 'button', disabled: true }, icon('check'), multi ? tr(' Übernehmen') : tr(' Verknüpfen'));
  const dlg = h('dialog.modal.ai-dialog');
  fill(
    dlg,
    h('div.row', h('h3.grow', icon('book'), tr(' Charaktere aus BasaltNotes')), h('button.small', { type: 'button', onclick: () => dlg.close(), title: tr('Schließen') }, icon('x'))),
    h('p.small.muted', tr('Vault „{vault}“, Kampagne „{campaign}“ – einstellbar auf der Kampagnenseite.', { vault, campaign })),
    listEl,
    h('div.row.end', { style: { marginTop: '10px' } }, ok),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  let chars = [];
  try {
    chars = (await api('GET', `/api/basalt/characters?campaign=${encodeURIComponent(campaign)}&vault=${encodeURIComponent(vault)}`)).map((c) => ({ ...c, vault }));
  } catch (err) {
    return fill(listEl, h('p', err.message));
  }
  const free = chars.filter((c) => !exclude.includes(c.id));
  if (!free.length) return fill(listEl, h('p.muted', chars.length ? tr('Alle Charaktere dieser Kampagne sind schon in der Gruppe.') : tr('In BasaltNotes gibt es für diese Kampagne noch keine Charaktere (Typ „Charakter“).')));
  fill(
    listEl,
    free.map((c) => {
      const fm = c.frontmatter || {};
      const item = h(
        'div.list-item.clickable',
        {
          onclick: () => {
            if (!multi) chosen.clear();
            chosen.has(c.id) ? chosen.delete(c.id) : chosen.add(c.id);
            for (const el of listEl.children) el.classList.toggle('selected', chosen.has(el.dataset.id));
            ok.disabled = !chosen.size;
          },
          dataset: { id: c.id },
        },
        icon('user', { size: 24 }),
        h('span.title', c.title, h('div.small.muted', [fm.race, fm.class, fm.player && tr('gespielt von {player}', { player: fm.player })].filter(Boolean).join(' · '))),
      );
      return item;
    }),
  );
  ok.addEventListener('click', () => {
    onPick(free.filter((c) => chosen.has(c.id)));
    dlg.close();
  });
}

/** Bild aus BasaltNotes in die Kampagne übernehmen. */
export async function importBasaltImage(cid, name, title, vault) {
  try {
    return await api('POST', `/api/campaigns/${cid}/basalt/image`, { name, title, vault });
  } catch (err) {
    toast(err.message, 4000);
    return null;
  }
}
