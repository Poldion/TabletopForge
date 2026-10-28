// WLED (LED-Streifen am Spieltisch): Einrichtung unter „Bildschirme“ und Stimmungswahl beim Spielen.
import { h, fill, api, toast } from './util.js';
import { icon } from './icons.js';
import { tr, tMsg } from './i18n.js';

let status = null;
const listeners = new Set();
let subscribed = false;

/** Aktuellen WLED-Status laden und bei Änderungen (Socket „wled“) alle Anzeigen aktualisieren. */
function watch(sync, fn) {
  listeners.add(fn);
  if (!subscribed) {
    subscribed = true;
    sync.socket.on('wled', (st) => {
      status = st;
      for (const l of listeners) l(st);
    });
  }
  if (status) fn(status);
  else
    api('GET', '/api/wled')
      .then((st) => {
        status = st;
        for (const l of listeners) l(st);
      })
      .catch(() => {});
  return () => listeners.delete(fn);
}

const setMood = async (sync, mood) => {
  try {
    status = await api('POST', '/api/wled/mood', { mood, campaignId: sync.campaignId });
    for (const l of listeners) l(status);
  } catch (err) {
    toast(err.message);
  }
};

/** Kompakte Auswahl für die Schnellleiste beim Spielen (nur sichtbar, wenn WLED eingerichtet ist). */
export function createMoodSelect(sync) {
  const sel = h('select.small', { title: tr('Stimmung der LEDs am Tisch'), style: { width: 'auto', minHeight: '32px' } });
  const wrap = h('span.hidden', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, icon('bulb'), sel);
  sel.addEventListener('change', () => setMood(sync, sel.value || null));
  const off = watch(sync, (st) => {
    // Abmelden, sobald die Anzeige ersetzt wurde (erst nachdem sie einmal sichtbar war)
    if (wrap.isConnected) wrap.dataset.seen = '1';
    else if (wrap.dataset.seen) return off();
    wrap.classList.toggle('hidden', !st.hasAuto);
    fill(sel, h('option', { value: '' }, tr('LEDs: Automatik')), ...st.moods.map((m) => h('option', { value: m.key, selected: st.manual === m.key }, m.name)));
  });
  return wrap;
}

const moodName = (st, key) => st.moods.find((m) => m.key === key)?.name || key || '–';

/** Einrichtungskarte unter „Bildschirme“: beliebig viele Streifen, je Automatik oder feste Stimmung. */
export function createWledCard(sync) {
  const el = h('div.card');
  let draft = null; // { devices: [...] } – Bearbeitungsstand bis „Speichern“
  let dirty = false;
  let last = null;

  const save = async () => {
    try {
      status = await api('PUT', '/api/wled', draft);
      dirty = false;
      draft = null;
      toast(tr('LED-Einstellungen gespeichert'));
      for (const l of listeners) l(status);
    } catch (err) {
      toast(err.message);
    }
  };

  const deviceCard = (st, d, i) => {
    const live = st.devices.find((x) => x.id === d.id);
    const change = (fn) => (e) => {
      fn(e.target);
      dirty = true;
      if (e.type === 'change') render(last);
    };
    const check = (obj, key, label) => h('label.inline', h('input', { type: 'checkbox', checked: !!obj[key], onchange: change((t) => (obj[key] = t.checked)) }), label);
    const testOut = h('span.small.muted');
    const isAuto = d.mode === 'auto';
    return h(
      'div.card',
      { style: { marginTop: '8px', background: 'var(--bg)' } },
      h(
        'div.row',
        { style: { gap: '6px' } },
        h('input', { value: d.name, placeholder: tr('Name, z.B. Decke'), style: { flex: 1, fontWeight: 600 }, oninput: change((t) => (d.name = t.value)) }),
        check(d, 'enabled', 'aktiv'),
        h('button.small', {
          title: tr('Streifen entfernen'),
          onclick: () => {
            if (!confirm(tr('„{name}“ entfernen?', { name: d.name }))) return;
            draft.devices.splice(i, 1);
            dirty = true;
            render(last);
          },
        }, icon('trash')),
      ),
      h(
        'div.row',
        { style: { gap: '6px', marginTop: '6px' } },
        h('input', { value: d.host, placeholder: tr('IP-Adresse, z.B. 192.168.1.50'), style: { flex: 1 }, oninput: change((t) => (d.host = t.value)) }),
        h('button.small', {
          onclick: async () => {
            testOut.textContent = tr('Teste …');
            try {
              const r = await api('GET', `/api/wled/test?host=${encodeURIComponent(d.host)}`);
              testOut.textContent = tr('✔ {name} (WLED {version}, {leds} LEDs)', { name: r.name, version: r.version, leds: r.leds });
            } catch (err) {
              testOut.textContent = `✘ ${err.message}`;
            }
          },
        }, tr('Verbindung testen')),
      ),
      testOut,
      h(
        'div.row',
        { style: { gap: '6px', marginTop: '6px' } },
        h('span.small.muted', tr('Licht')),
        h(
          'select',
          { style: { flex: 1 }, onchange: change((t) => (d.mode = t.value)) },
          h('option', { value: 'auto', selected: isAuto }, tr('Automatik – folgt dem Spiel')),
          st.moods.filter((m) => !['combat', 'pause'].includes(m.key)).map((m) => h('option', { value: m.key, selected: d.mode === m.key }, tr('immer: {name}', { name: m.name }))),
        ),
      ),
      h(
        'div.row',
        { style: { gap: '6px', marginTop: '6px' }, title: tr('Live: der Server berechnet die Effekte selbst und schickt sie ~30-mal pro Sekunde – am weichsten. Braucht in WLED unter Sync „Receive UDP realtime“ (ab Werk an).') },
        h('span.small.muted', tr('Übertragung')),
        h(
          'select',
          { style: { flex: 1 }, onchange: change((t) => (d.stream = t.value === 'live')) },
          h('option', { value: 'live', selected: d.stream !== false }, tr('Live vom Server (weich, empfohlen)')),
          h('option', { value: 'json', selected: d.stream === false }, tr('WLED-Effekte (falls Live nicht ankommt)')),
        ),
      ),
      h(
        'div.row',
        { style: { gap: '6px', marginTop: '6px' } },
        h('span.small.muted', tr('Helligkeit (max.)')),
        h('input', { type: 'range', min: 10, max: 255, value: d.brightness, style: { flex: 1 }, oninput: change((t) => (d.brightness = Number(t.value))) }),
      ),
      isAuto
        ? [
            h(
              'div.row',
              { style: { gap: '6px', marginTop: '6px' } },
              h('span.small.muted', tr('Grundstimmung')),
              h(
                'select',
                { style: { flex: 1 }, onchange: change((t) => (d.idleMood = t.value)) },
                st.moods.filter((m) => !['off', 'combat', 'pause'].includes(m.key)).map((m) => h('option', { value: m.key, selected: d.idleMood === m.key }, m.name)),
              ),
            ),
            h('div.row', { style: { gap: '10px', marginTop: '4px' } }, check(d.auto, 'combat', tr('Kampf → rot')), check(d.auto, 'blackout', tr('Verdunkeln → Pause')), check(d.auto, 'maps', tr('Stimmung der Tischkarte'))),
          ]
        : null,
      live && live.enabled && live.host
        ? h('div.small', { style: { marginTop: '6px', color: live.error ? 'var(--danger)' : '' } }, live.error ? `✘ ${tMsg(live.error)}` : tr('Jetzt: {moodName}', { moodName: moodName(st, live.current) }))
        : null,
    );
  };

  const render = (st) => {
    last = st;
    fill(
      el,
      h('div.section-title', icon('bulb'), tr(' LED-Streifen (WLED)')),
      h(
        'p.small.muted',
        tr('Beliebig viele WLED-Controller (ESP32/ESP8266). Jeder Streifen folgt entweder dem Spiel – Kampf leuchtet rot, beim Verdunkeln wird es ruhig, jede Karte kann eine eigene Stimmung haben – oder hält immer dieselbe Stimmung, z.B. Leselicht an der Decke.'),
      ),
      draft.devices.map((d, i) => deviceCard(st, d, i)),
      h(
        'div.row',
        { style: { marginTop: '8px' } },
        h('button.small', {
          onclick: () => {
            const n = draft.devices.length;
            draft.devices.push({ id: '', name: n ? tr('Streifen {x}', { x: n + 1 }) : tr('Tisch'), enabled: true, host: '', brightness: 160, mode: 'auto', stream: true, idleMood: 'warm', auto: { blackout: true, combat: true, maps: true } });
            dirty = true;
            render(st);
          },
        }, icon('plus'), tr(' Streifen hinzufügen')),
        h('span.spacer'),
        dirty ? h('span.small.muted', tr('Ungespeicherte Änderungen ')) : null,
        h('button.primary.small', { onclick: save }, icon('check'), tr(' Speichern')),
      ),
      st.hasAuto
        ? [
            h('div.small.muted', { style: { marginTop: '10px' } }, tr('Stimmung für alle Streifen mit Automatik (gilt bis zum nächsten Kartenwechsel; Kampf und Verdunkeln haben Vorrang):')),
            h(
              'div.row',
              { style: { gap: '4px', marginTop: '6px' } },
              h('button.small', { class: !st.manual ? 'active' : '', onclick: () => setMood(sync, null) }, tr('Automatik')),
              st.moods.map((m) => h('button.small', { class: st.manual === m.key ? 'active' : '', onclick: () => setMood(sync, m.key) }, m.name)),
            ),
          ]
        : null,
    );
  };

  const off = watch(sync, (st) => {
    if (el.isConnected) el.dataset.seen = '1';
    else if (el.dataset.seen) return off();
    // Ungespeicherte Änderungen nicht überschreiben – nur die Statuszeilen auffrischen
    if (!draft || !dirty) draft = { devices: st.devices.map(({ current, error, ...d }) => structuredClone(d)) };
    last = st;
    if (el.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), select')) return;
    render(st);
  });
  return el;
}

// Stimmungen für die Karten-Einstellung (wie server/wled.js – ohne Kampf/Pause, die schaltet die Automatik)
const MAP_MOODS = { read: tr('Leselicht (hell, warmweiß)'), warm: tr('Taverne (warmes Licht)'), candle: tr('Kerzenschein'), fire: tr('Lagerfeuer'), forest: tr('Wald'), cave: tr('Höhle / Dungeon'), night: tr('Nacht'), storm: tr('Gewitter'), magic: tr('Magie'), water: tr('Unterwasser'), off: tr('Aus') };

/** Stimmungs-Optionen für die Karten-Einstellung (LED-Stimmung je Karte). */
export function moodOptions(selected) {
  return [h('option', { value: '' }, tr('– Grundstimmung –')), ...Object.entries(MAP_MOODS).map(([k, l]) => h('option', { value: k, selected: k === selected }, l))];
}
