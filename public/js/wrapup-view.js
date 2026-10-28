// Nachbereitung einer Session: was ist passiert (Szenen mit Stichworten, Live-Notizen), Erfahrungspunkte aus den
// erledigten Begegnungen, Recap („Was bisher geschah“) per KI – den Spielern zeigen oder an BasaltNotes schicken –,
// offene Szenen weiterschieben und die nächste Session vorbereiten.
import { h, fill, api, toast, uid, markdown, sortBy, bindInput } from './util.js';
import { icon } from './icons.js';
import { tr, lang, LANGUAGES, locale } from './i18n.js';
import { scenesOf, carryOverOps } from '../../shared/sessions.js';
import { evaluateEncounter } from './encounter-view.js';
import { ai, aiTextButton, mergeText } from './ai.js';
import { basalt, basaltCampaign, basaltVault } from './basalt.js';
import { newSession } from './overview-views.js';

/** Recap vom Sprachmodell: aus Szenen, Stichworten und Live-Notizen. */
async function writeRecap(st, s) {
  const scenes = scenesOf(s)
    .filter((x) => x.status === 'done' || x.playNotes)
    .map((x, i) => `${i + 1}. ${x.title}${x.improvised ? ' (improvised)' : ''}${x.status !== 'done' ? ' (not finished)' : ''}\n   Plan: ${(x.notes || '').slice(0, 400)}\n   What happened: ${x.playNotes || '-'}`);
  const party = (st.party?.members || []).map((m) => `${m.name} (${[m.race, m.class].filter(Boolean).join(' ')})`);
  const content = [
    `Campaign "${st.name}", adventure "${st.adventures[s.adventureId]?.name || ''}", session "${s.name}".`,
    party.length ? `Characters: ${party.join(', ')}.` : '',
    'Scenes:',
    scenes.join('\n') || '-',
    s.liveNotes ? `Notes taken during play:\n${s.liveNotes}` : '',
    '',
    `Write a recap "What happened so far" for the players in ${LANGUAGES[lang] || 'German'}: past tense, 1–3 short paragraphs, name the characters, mention open threads at the end as a short list. Prefer what actually happened over the plan; do not reveal secrets from the plan that the players did not discover. Reply with the Markdown text only.`,
  ].filter(Boolean).join('\n');
  const r = await api('POST', '/api/ai/text', { system: 'You are the chronicler of a Dungeons & Dragons campaign.', messages: [{ role: 'user', content }] });
  return r.text;
}

export function createWrapupView({ sync, cid, go }) {
  const S = () => sync.state;
  return function view(sid) {
    const page = h('div.page.scenes-page');
    const el = h('div.scroll', { style: { width: '100%' } }, page);
    const refreshers = [];
    const render = () => {
      refreshers.length = 0;
      const st = S();
      const s = st.sessions[sid];
      if (!s) return fill(page, h('p.muted', tr('Session nicht gefunden.')));
      const P = (...k) => ['sessions', sid, ...k];
      const scenes = scenesOf(s);
      const open = scenes.filter((x) => x.status !== 'done');

      // Erfahrungspunkte: Begegnungen der erledigten Szenen
      const encs = scenes.filter((x) => x.status === 'done' && st.encounters?.[x.encounterId]).map((x) => st.encounters[x.encounterId]);
      const xp = encs.reduce((n, e) => n + evaluateEncounter(st, e).xp, 0);
      const party = st.party?.members || [];

      const recap = h('textarea', { rows: 8, placeholder: tr('„Was bisher geschah“ – für den Einstieg in die nächste Session …') });
      refreshers.push(bindInput(recap, () => S().sessions[sid]?.recap, (v) => sync.set(P('recap'), v), { debounceMs: 300 }));
      const live = h('textarea', { rows: 4, placeholder: tr('Notizen aus dem Spiel …') });
      refreshers.push(bindInput(live, () => S().sessions[sid]?.liveNotes, (v) => sync.set(P('liveNotes'), v), { debounceMs: 300 }));

      const recapBtn = ai.text
        ? h('button', {
            onclick: async (e) => {
              const b = e.currentTarget;
              b.disabled = true;
              const old = b.textContent;
              b.textContent = tr('Die KI schreibt …');
              try {
                const text = await writeRecap(S(), S().sessions[sid]);
                sync.set(P('recap'), mergeText('', text, 'replace'));
                render();
              } catch (err) {
                toast(err.message, 4000);
              } finally {
                b.disabled = false;
                b.textContent = old;
              }
            },
          }, icon('sparkles'), tr(' Recap mit KI schreiben'))
        : null;
      const sendBtn = basalt.enabled
        ? h('button', {
            title: tr('Als Session-Notiz in den Eingang von BasaltNotes – der Kurator ordnet NSCs, Orte und Quests ein'),
            onclick: async (e) => {
              const b = e.currentTarget;
              b.disabled = true;
              const cur = S().sessions[sid];
              const body = [cur.recap ? `## ${tr('Was bisher geschah')}\n${cur.recap}` : '', `## ${tr('Szenen')}\n${scenesOf(cur).map((x) => `- **${x.title}**${x.status !== 'done' ? ` (${tr('offen')})` : ''}${x.playNotes ? `: ${x.playNotes}` : ''}`).join('\n')}`].filter(Boolean).join('\n\n');
              try {
                await api('POST', `/api/campaigns/${cid}/basalt/session`, { sessionId: sid, vault: basaltVault(S()), campaign: basaltCampaign(S()), title: `${cur.date || new Date(cur.endedAt || Date.now()).toISOString().slice(0, 10)} ${cur.name}`, body, attachments: cur.liveNotes ? [{ name: tr('Notizen aus dem Spiel'), kind: 'notes', markdown: cur.liveNotes, visibility: 'dm' }] : [] });
                sync.set(P('sentToBasalt'), Date.now());
                toast(tr('An BasaltNotes geschickt'));
              } catch (err) {
                // Token ohne Schreibrecht: sagen, wo man es freigibt
                const hint = /403|inbox/i.test(err.message) ? ` – ${tr('In BasaltNotes unter Einstellungen → API-Tokens dem Token das Recht „Eingang“ geben.')}` : '';
                toast(err.message + hint, 8000);
              } finally {
                b.disabled = false;
              }
            },
          }, icon('book'), s.sentToBasalt ? tr(' Erneut an BasaltNotes') : tr(' An BasaltNotes schicken'))
        : null;

      // Nächste Session des Abenteuers (oder neue)
      const nextSession = sortBy(Object.values(st.sessions).filter((x) => x.adventureId === s.adventureId && (x.order ?? 0) > (s.order ?? 0) && x.status !== 'done'), (x) => x.order)[0];

      fill(
        page,
        h('div.row', h('h1.grow', { style: { margin: 0 } }, tr('Nachbereitung: {name}', { name: s.name })), s.status !== 'done' ? h('button', { onclick: () => sync.set(P('status'), 'done') }, icon('check'), tr(' Als gespielt markieren')) : h('span.chip', tr('gespielt'))),
        s.endedAt ? h('p.small.muted', tr('Beendet am {date}', { date: new Date(s.endedAt).toLocaleString(locale) })) : null,

        h('h2', icon('calendar'), tr(' Was ist passiert?')),
        scenes.length
          ? scenes.map((x, i) => {
              const ta = h('textarea', { rows: 2, placeholder: tr('Stichworte …') });
              refreshers.push(bindInput(ta, () => S().sessions[sid]?.scenes?.[x.id]?.playNotes, (v) => sync.set(P('scenes', x.id, 'playNotes'), v), { debounceMs: 300 }));
              return h('div.card.scene', { class: `scene-${x.status}` }, h('div.scene-head', h('span.scene-n', x.status === 'done' ? '✓' : String(i + 1)), h('b.grow', x.title), x.improvised ? h('span.chip', tr('Stegreif')) : null, x.status !== 'done' ? h('span.chip', tr('offen')) : null), ta);
            })
          : h('p.muted', tr('Keine Szenen.')),
        open.length
          ? h('div.row', { style: { marginTop: '8px' } }, h('span.small.muted.grow', tr('{n} Szenen sind offen geblieben.', { n: open.length })), h('button', {
              onclick: () => {
                const r = carryOverOps(S(), sid, uid);
                if (!r) return;
                sync.do(r.ops.filter((op) => !(op.p[0] === 'display' && op.p[1] === 'sessionId')));
                toast(tr('In „{name}“ übernommen', { name: S().sessions[r.target]?.name }));
                render();
              },
            }, icon('chevronRight'), tr(' In die nächste Session schieben')))
          : null,
        h('div.section-title', tr('Notizen aus dem Spiel')),
        live,

        h('h2', icon('swords'), tr(' Erfahrungspunkte')),
        encs.length
          ? h('p', tr('{xp} EP aus {n} Begegnungen – {per} EP je Charakter ({players} Charaktere).', { xp, n: encs.length, per: party.length ? Math.floor(xp / party.length) : xp, players: party.length || '?' }), ' ', h('a', { href: '#party' }, tr('Gruppe & Stufen')))
          : h('p.small.muted', tr('Keine Begegnungen in erledigten Szenen – Meilenstein-Aufstiege trägst du direkt bei der Gruppe ein.'), ' ', h('a', { href: '#party' }, tr('Gruppe & Stufen'))),

        h('h2', icon('book'), tr(' Was bisher geschah')),
        h('div.row', { style: { gap: '6px', flexWrap: 'wrap', marginBottom: '6px' } }, recapBtn, aiTextButton(() => ({ about: `Recap of the D&D session "${S().sessions[sid]?.name}"`, current: () => recap.value, tasks: ['expand', 'summary'], apply: (t, mode) => { const v = mergeText(recap.value, t, mode); recap.value = v; sync.set(P('recap'), v); } })), s.recap ? h('button', { onclick: () => (sync.merge(['display', 'player'], { mode: 'text', text: S().sessions[sid].recap, caption: tr('Was bisher geschah') }), toast(tr('Auf dem Spieler-Display'))) }, icon('image'), tr(' Spielern zeigen')) : null, sendBtn),
        recap,
        s.recap ? h('details.small', h('summary', tr('Vorschau')), h('div.md', { innerHTML: markdown(s.recap) })) : null,

        h(
          'div.row',
          { style: { marginTop: '18px', gap: '6px' } },
          h('span.grow'),
          h('button', { onclick: () => go('adventure') }, icon('flag'), tr(' Zum Abenteuer')),
          h('button.primary', { onclick: () => go(`session/${nextSession ? nextSession.id : newSession(sync, s.adventureId)}`) }, icon('calendar'), nextSession ? tr(' {name} vorbereiten', { name: nextSession.name }) : tr(' Nächste Session anlegen')),
        ),
      );
    };
    render();
    return {
      el,
      refresh(changed) {
        if (!['sessions', 'encounters', 'party', '*'].some((k) => changed.has(k))) return;
        if (page.contains(document.activeElement) && document.activeElement.matches('textarea, input')) refreshers.forEach((f) => f());
        else render();
      },
    };
  };
}
