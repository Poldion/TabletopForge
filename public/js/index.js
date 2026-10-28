import { $, h, clear, api, toast } from './util.js';
import { icon } from './icons.js';
import { accountMenu } from './account.js';
import { tr, locale } from './i18n.js';

accountMenu($('#account'));

async function load() {
  const list = $('#list');
  const campaigns = await api('GET', '/api/campaigns');
  clear(list);
  if (!campaigns.length) {
    list.append(h('p.muted', tr('Noch keine Kampagnen vorhanden. Lege oben deine erste Kampagne an.')));
    return;
  }
  for (const c of campaigns) {
    const q = `?c=${c.id}`;
    list.append(
      h(
        'div.card.campaign',
        h('h2', c.name),
        c.description ? h('p.muted.small', c.description) : null,
        h('div.small.muted', tr('{sessions} Sessions · {maps} Karten · zuletzt {toLocaleString}', { sessions: c.sessions, maps: c.maps, toLocaleString: new Date(c.updatedAt).toLocaleString(locale) })),
        h('a.btn.primary', { href: `/dm.html${q}`, style: { width: '100%', marginTop: '12px', minHeight: '48px', fontSize: '16px' } }, icon('play'), tr(' Kampagne öffnen')),
        h(
          'div.links',
          h('a.btn.small', { href: `/table.html${q}`, target: '_blank', title: tr('Auf dem liegenden TV öffnen') }, icon('monitor'), tr(' Spieltisch-Anzeige')),
          h('a.btn.small', { href: `/player.html${q}`, target: '_blank', title: tr('Auf dem Spieler-Bildschirm öffnen') }, icon('image'), tr(' Spieler-Anzeige')),
        ),
        h(
          'div.row.end',
          { style: { marginTop: '10px' } },
          h(
            'button.small.danger',
            {
              onclick: async () => {
                const typed = window.prompt(tr('Zum Löschen den Namen „{name}“ eingeben. Alle Karten, Notizen und Dateien gehen verloren.', { name: c.name }));
                if (typed !== c.name) return;
                await api('DELETE', `/api/campaigns/${c.id}`);
                toast(tr('Kampagne gelöscht'));
                load();
              },
            },
            tr('Löschen'),
          ),
        ),
      ),
    );
  }
}

$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#name').value.trim();
  if (!name) return;
  const c = await api('POST', '/api/campaigns', { name });
  location.href = `/dm.html?c=${c.id}#sessions`;
});

load().catch((err) => toast(err.message));
api('GET', '/api/version').then((v) => ($('#version').textContent = `v${v.version}`)).catch(() => {});
