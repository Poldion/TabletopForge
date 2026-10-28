// Gruppe der Kampagne: die Spielercharaktere mit Porträt, Werten und Hintergrund. Gilt für die Schwierigkeit von
// Encountern, für Zufallsbegegnungen und den Kampf (TP/RK). Jeder Charakter kann mit seiner Notiz in BasaltNotes
// verknüpft sein – der Hintergrund kommt dann von dort und wird dort bearbeitet.
import { h, fill, uid, bindInput, byOrder, fileUrl, uploadFiles, api, toast } from './util.js';
import { figureImages } from './components.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';
import { aiTextButton, aiImageButton, mergeText } from './ai.js';
import { basalt, basaltHtml, basaltVault, pickBasaltCharacter, importBasaltImage } from './basalt.js';
import { ai } from './ai.js';
import { openAiCreator } from './creature-ai.js';

/** Angaben einer Basalt-Notiz für den Charakter (nur gefüllte Felder). */
const fromBasalt = (c) => {
  const fm = c.frontmatter || {};
  // Vault mitmerken: die Verknüpfung bleibt gültig, auch wenn die Kampagne später einen anderen Vault nutzt
  const out = { name: c.title, basaltId: c.id, basaltVault: c.vault || null };
  for (const k of ['player', 'class', 'race']) if (fm[k]) out[k] = String(fm[k]);
  if (Number(fm.level) > 0) out.level = Math.min(20, Number(fm.level));
  return out;
};

export function createPartyView({ sync, cid, go }) {
  const S = () => sync.state;
  const members = () => S().party?.members || [];
  const setMembers = (next) => sync.set(['party'], { ...(S().party || {}), members: next });
  const patch = (id, v) => setMembers(members().map((m) => (m.id === id ? { ...m, ...v } : m)));
  const portraitOf = (m) => (m?.portraitAssetId && S().assets[m.portraitAssetId] ? fileUrl(cid, S().assets[m.portraitAssetId]) : '');
  const summary = (m) => [m.race, m.class, tr('Stufe {level}', { level: m.level || 1 })].filter(Boolean).join(' · ');

  return function view(selectedId) {
    const listBox = h('div.list');
    const detail = h('section');
    let refreshDetail = null;
    let shownId = null;

    const add = (init = {}) => {
      const m = { id: uid(), name: '', level: members().at(-1)?.level || 1, ...init };
      setMembers([...members(), m]);
      return m;
    };

    const renderList = () => {
      fill(
        listBox,
        members().length
          ? members().map((m) =>
              h(
                'div.list-item.clickable',
                { class: m.id === selectedId ? 'selected' : '', onclick: () => go(`party/${m.id}`) },
                portraitOf(m) ? h('img', { src: portraitOf(m), style: { width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%' } }) : icon('user', { size: 24 }),
                h('span.title', m.name || tr('Unbenannt'), h('div.small.muted', [summary(m), m.player].filter(Boolean).join(' · '))),
                m.basaltId && basalt.enabled ? h('span.chip', { title: tr('Mit BasaltNotes verknüpft') }, icon('book')) : null,
              ),
            )
          : h('p.small.muted', tr('Noch keine Charaktere.')),
      );
    };

    /** Übersicht ohne Auswahl: alle Charaktere als Karten. */
    const overview = () =>
      h(
        'div',
        { style: { padding: '20px', maxWidth: '1000px' } },
        h('h2', icon('user'), tr(' Gruppe')),
        h('p.muted', tr('Die Spielercharaktere dieser Kampagne. Stufe und Anzahl bestimmen die Schwierigkeit von Encountern und Zufallsbegegnungen, TP und RK übernimmt der Kampf.')),
        members().length
          ? h(
              'div.party-cards',
              members().map((m) =>
                h(
                  'div.party-card.clickable',
                  { onclick: () => go(`party/${m.id}`) },
                  portraitOf(m) ? h('img', { src: portraitOf(m) }) : h('div.party-noimg', icon('user')),
                  h('b', m.name || tr('Unbenannt')),
                  h('div.small.muted', summary(m)),
                  m.player ? h('div.small.muted', tr('gespielt von {player}', { player: m.player })) : null,
                  m.hp || m.ac ? h('div.small', [m.hp && tr('TP {hp}', { hp: m.hp }), m.ac && tr('RK {ac}', { ac: m.ac })].filter(Boolean).join(' · ')) : null,
                ),
              ),
            )
          : null,
      );

    /** Hintergrund aus BasaltNotes (verknüpft) oder eigener Text. */
    const background = (m, P) => {
      if (m.basaltId && basalt.enabled) {
        const box = h('div.card.basalt-card', h('p.small.muted', tr('Lädt aus BasaltNotes …')));
        const vault = m.basaltVault || basaltVault(S());
        api('GET', `/api/basalt/notes/${encodeURIComponent(m.basaltId)}?vault=${encodeURIComponent(vault)}`)
          .then((n) => {
            const fm = n.frontmatter || {};
            const wants = fromBasalt({ title: n.title, id: n.id, frontmatter: fm, vault });
            const differs = ['name', 'player', 'class', 'race', 'level'].some((k) => wants[k] !== undefined && String(wants[k]) !== String(m[k] ?? ''));
            fill(
              box,
              h(
                'div.row',
                h('b.grow', icon('book'), ` ${n.title}`),
                differs ? h('button.small', { title: tr('Name, Spieler:in, Volk, Klasse aus der Notiz übernehmen'), onclick: () => patch(m.id, wants) }, icon('download'), tr(' Angaben übernehmen')) : null,
                h('a.btn.small', { href: n.url, target: '_blank', rel: 'noopener', title: tr('In BasaltNotes bearbeiten') }, icon('external'), tr(' In BasaltNotes öffnen')),
                h('button.small', { title: tr('Verknüpfung lösen (die Notiz bleibt in BasaltNotes)'), onclick: () => confirm(tr('Verknüpfung mit „{title}“ lösen?', { title: n.title })) && patch(m.id, { basaltId: null, basaltVault: null }) }, icon('x')),
              ),
              n.images?.length
                ? h(
                    'div.row',
                    { style: { gap: '6px', margin: '6px 0' } },
                    h('span.small.muted', tr('Bilder der Notiz – antippen = als Porträt übernehmen:')),
                    n.images.map((name) =>
                      h('img.basalt-thumb', {
                        src: `/api/basalt/attachments/${encodeURIComponent(name)}?vault=${encodeURIComponent(vault)}`,
                        title: name,
                        onclick: async () => {
                          const a = await importBasaltImage(cid, name, m.name || n.title, vault);
                          if (a) patch(m.id, { portraitAssetId: a.id });
                        },
                      }),
                    ),
                  )
                : null,
              n.html ? basaltHtml(n.html) : h('p.small.muted', tr('Die Notiz ist noch leer.')),
            );
          })
          .catch((err) => fill(box, h('p', err.message), h('button.small', { onclick: () => patch(m.id, { basaltId: null, basaltVault: null }) }, tr('Verknüpfung lösen'))));
        return box;
      }
      const ta = h('textarea', { rows: 8, placeholder: tr('Hintergrund, Persönlichkeit, Ziele, Verbindungen zur Welt …') });
      const r = bindInput(ta, () => members().find((x) => x.id === m.id)?.notes, (v) => patch(m.id, { notes: v }), { debounceMs: 300 });
      P.push(r);
      return h(
        'div',
        h(
          'div.row.end',
          basalt.enabled
            ? h('button.small', {
                title: tr('Den Hintergrund aus der Charakter-Notiz in BasaltNotes anzeigen'),
                onclick: () => pickBasaltCharacter(sync, { exclude: members().map((x) => x.basaltId).filter(Boolean), onPick: ([c]) => c && patch(m.id, fromBasalt(c)) }),
              }, icon('book'), tr(' Mit BasaltNotes verknüpfen'))
            : null,
          aiTextButton(() => ({
            title: tr('{name} mit KI ausarbeiten', { name: m.name || tr('Charakter') }),
            about: `D&D 5e player character "${m.name}" (${[m.race, m.class, `level ${m.level || 1}`].filter(Boolean).join(', ')})${S().name ? ` in the campaign "${S().name}"` : ''}`,
            current: () => ta.value,
            apply: (text, mode) => {
              const v = mergeText(ta.value, text, mode);
              ta.value = v;
              patch(m.id, { notes: v });
            },
            tasks: ['expand', 'ideas', 'summary'],
          })),
        ),
        ta,
      );
    };

    const renderDetail = () => {
      const m = members().find((x) => x.id === selectedId);
      shownId = m?.id || null;
      if (!m) {
        refreshDetail = null;
        return fill(detail, overview());
      }
      const M = () => members().find((x) => x.id === m.id) || {};
      const refreshers = [];
      const inp = (key, attrs = {}, parse = (v) => v) => {
        const el = h('input', attrs);
        refreshers.push(bindInput(el, () => M()[key] ?? '', (v) => patch(m.id, { [key]: parse(v) }), { debounceMs: 250 }));
        return el;
      };
      const num = (min, max) => (v) => (v === '' ? null : Math.max(min, Math.min(max, Math.round(Number(v)) || min)));
      const f = (label, el) => h('div', h('label', label), el);
      const portraitSel = h('select', h('option', { value: '' }, tr('– kein Porträt –')), ...byOrder(S().assets).filter((a) => a.kind === 'image').map((a) => h('option', { value: a.id }, a.name)));
      refreshers.push(bindInput(portraitSel, () => M().portraitAssetId || '', (v) => patch(m.id, { portraitAssetId: v || null }), { debounceMs: 0, event: 'change' }));
      const upload = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
      upload.addEventListener('change', async () => {
        const [a] = await uploadFiles(cid, [...upload.files]);
        if (a) patch(m.id, { portraitAssetId: a.id });
      });
      const portrait = portraitOf(m);
      refreshDetail = () => refreshers.forEach((r) => r());
      fill(
        detail,
        h(
          'div',
          { style: { maxWidth: '900px' } },
          h(
            'div.row',
            { style: { marginBottom: '12px' } },
            portrait ? h('img', { src: portrait, style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '50%' } }) : null,
            h('h2.grow', { style: { margin: 0 } }, m.name || tr('Unbenannt')),
            portrait ? h('button', { onclick: () => (sync.merge(['display', 'player'], { mode: 'image', assetId: m.portraitAssetId, caption: m.name }), toast(tr('Porträt auf dem Spieler-Display'))) }, icon('image'), tr(' Spielern zeigen')) : null,
            h('button.danger', { onclick: () => confirm(tr('„{name}“ aus der Gruppe entfernen?', { name: m.name || tr('Unbenannt') })) && (setMembers(members().filter((x) => x.id !== m.id)), go('party')) }, tr('Entfernen')),
          ),
          figureImages(sync, cid, [[tr('Porträt'), m.portraitAssetId], [tr('Token'), m.tokenAssetId]], m.name),
          h('div.grid3', f(tr('Name'), inp('name')), f(tr('Spieler:in'), inp('player')), f(tr('Volk'), inp('race', { placeholder: tr('z.B. Halbelf') }))),
          h('div.grid3', f(tr('Klasse'), inp('class', { placeholder: tr('z.B. Schurkin') })), f(tr('Stufe'), inp('level', { type: 'number', min: 1, max: 20 }, num(1, 20))), f(tr('Rüstungsklasse'), inp('ac', { type: 'number', min: 1, max: 40 }, num(1, 40)))),
          h('div.grid3', f(tr('Trefferpunkte (max.)'), inp('hp', { type: 'number', min: 1, max: 999 }, num(1, 999))), f(tr('Passive Wahrnehmung'), inp('passive', { type: 'number', min: 1, max: 40 }, num(1, 40))), h('div')),
          h('div.section-title', tr('Porträt / Token-Bild')),
          h(
            'div.row',
            h('div.grow', portraitSel),
            upload,
            h('button', { onclick: () => upload.click() }, icon('upload'), tr(' Bild hochladen')),
            aiImageButton(() => ({
              sync,
              cid,
              purpose: 'token',
              prompt: [M().race, M().class].filter(Boolean).join(' ') || M().name || '',
              name: M().name || tr('Charakter'),
              sourceAssetId: M().portraitAssetId,
              onDone: (a) => patch(m.id, { portraitAssetId: a.id }),
            })),
          ),
          h('div.section-title', tr('Hintergrund')),
          background(m, refreshers),
        ),
      );
    };

    const el = h(
      'div.split',
      h(
        'aside',
        h('button.primary', { style: { width: '100%' }, onclick: () => go(`party/${add().id}`) }, icon('plus'), tr(' Charakter')),
        ai.text ? h('button', { style: { width: '100%', marginTop: '6px' }, title: tr('Charakter aus einer Beschreibung – mit Werten, Porträt und Token'), onclick: () => openAiCreator(sync, { mode: 'pc', onCreated: (id) => go(`party/${id}`) }) }, icon('sparkles'), tr(' Mit KI erstellen')) : null,
        basalt.enabled
          ? h('button', {
              style: { width: '100%', marginTop: '6px' },
              title: tr('Charaktere der Kampagne aus BasaltNotes übernehmen und verknüpfen'),
              onclick: () =>
                pickBasaltCharacter(sync, {
                  multi: true,
                  exclude: members().map((x) => x.basaltId).filter(Boolean),
                  onPick: (list) => {
                    const lvl = members().at(-1)?.level || 1;
                    setMembers([...members(), ...list.map((c) => ({ id: uid(), level: lvl, ...fromBasalt(c) }))]);
                    toast(tr('{n} Charaktere übernommen', { n: list.length }));
                  },
                }),
            }, icon('book'), tr(' Aus BasaltNotes'))
          : null,
        members().length
          ? h('button', { style: { width: '100%', marginTop: '6px' }, title: tr('Alle eine Stufe höher'), onclick: () => setMembers(members().map((x) => ({ ...x, level: Math.min(20, (x.level || 1) + 1) }))) }, icon('plus'), tr(' Stufenaufstieg'))
          : null,
        h('div', { style: { marginTop: '10px' } }, listBox),
      ),
      detail,
    );
    renderList();
    renderDetail();
    return {
      el,
      refresh(changed) {
        if (!(changed.has('party') || changed.has('assets') || changed.has('*'))) return;
        renderList();
        if (selectedId && !members().some((x) => x.id === selectedId)) return go('party');
        // Während getippt wird nur die Felder abgleichen; sonst neu aufbauen (z.B. neues Porträt, Verknüpfung)
        const typing = detail.contains(document.activeElement) && document.activeElement.matches('input, textarea');
        if (typing && refreshDetail && shownId === selectedId) refreshDetail();
        else renderDetail();
      },
    };
  };
}
