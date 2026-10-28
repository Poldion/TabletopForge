// Verwaltung der Kiosk-Geräte (Raspberry Pi o.ä.) im Bereich „Bildschirme“.
import { h, fill, api, toast, confirm2 } from './util.js';
import { icon } from './icons.js';
import { physicalSize, tableCells, cellDevicePxXY, sanitizeTable, OUTPUT_MODES, CELL_INCH } from '/shared/calibration.js';
import { tr, locale } from './i18n.js';
import { t } from './i18n.js';

// Agent-Versionen vor 1.7.0 haben keinen Geräteschlüssel (Anmeldung)
const agentTooOld = (v) => {
  const [a = 0, b = 0] = String(v).split('.').map(Number);
  return a < 1 || (a === 1 && b < 7);
};

const ago = (ts) => {
  if (!ts) return 'nie';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return tr('vor {s} s', { s });
  if (s < 3600) return tr('vor {round} min', { round: Math.round(s / 60) });
  return new Date(ts).toLocaleString(locale);
};

export function createKioskAdmin(sync, cid) {
  const el = h('div');
  let kiosks = [];
  let campaigns = [];
  let updates = []; // hochgeladene Update-Pakete (neueste zuerst)
  let uploading = null; // Fortschritt beim Hochladen eines Pakets (0–100)
  let globalTable = null; // globale Kalibrierung als Vorlage für eigene Monitordaten
  const openSettings = new Set();
  const drafts = new Map(); // Geräte-ID -> bearbeitete Einstellungen (bis „Speichern“)

  const put = async (id, body) => {
    try {
      await api('PUT', `/api/kiosks/${id}`, body);
      await load();
    } catch (err) {
      toast(err.message);
    }
  };
  const command = async (id, cmd, msg) => {
    await api('POST', `/api/kiosks/${id}/command`, { cmd });
    toast(msg);
  };

  const settingsForm = (k) => {
    if (!drafts.has(k.id)) {
      drafts.set(k.id, {
        serverUrl: k.desired.serverUrl || location.origin,
        hostname: k.desired.hostname || k.info.hostname || '',
        country: k.desired.country || 'DE',
        wifi: k.desired.wifi.map((w) => ({ ssid: w.ssid, psk: '', hasPsk: w.hasPsk })),
        engine: k.desired.browser?.engine || 'cog',
        gpu: k.desired.browser?.gpu || 'auto',
        ownMonitor: !!k.desired.monitor,
        monitor: sanitizeTable(k.desired.monitor || globalTable || {}, globalTable || undefined),
      });
    }
    const d = drafts.get(k.id);
    const input = (key, attrs = {}) => {
      const i = h('input', { value: d[key] ?? '', ...attrs });
      i.addEventListener('input', () => (d[key] = i.value));
      return i;
    };
    const wifiRows = h('div.list');
    const renderWifi = () =>
      fill(
        wifiRows,
        d.wifi.map((w, idx) => {
          const ssid = h('input', { value: w.ssid, placeholder: tr('WLAN-Name (SSID)') });
          ssid.addEventListener('input', () => (w.ssid = ssid.value));
          const psk = h('input', { type: 'password', value: w.psk, placeholder: w.hasPsk ? tr('•••••• gespeichert – leer lassen zum Behalten') : tr('Passwort'), autocomplete: 'new-password' });
          psk.addEventListener('input', () => (w.psk = psk.value));
          return h('div.kiosk-wifi', ssid, psk, h('button.small', { title: tr('Netz entfernen'), onclick: () => (d.wifi.splice(idx, 1), renderWifi()) }, icon('trash')));
        }),
        d.wifi.length ? null : h('p.small.muted', tr('Keine WLAN-Netze hinterlegt (z.B. bei LAN-Kabel).')),
      );
    renderWifi();
    const pending = k.desired.rev > k.reportedRev;
    return h(
      'div.kiosk-settings',
      h('div.grid3', h('div', h('label', tr('Server-Adresse')), input('serverUrl', { placeholder: 'http://192.168.x.x:4300' })), h('div', h('label', tr('Hostname')), input('hostname', { placeholder: tr('dnd-tisch') })), h('div', h('label', tr('WLAN-Land')), input('country', { maxlength: 2, placeholder: 'DE' }))),
      monitorSection(k, d),
      (() => {
        const sel = h(
          'select',
          ...Object.entries({ cog: tr('cog / WPE WebKit (schlank, empfohlen für Pi Zero 2 W)'), chromium: tr('Chromium (mehr Speicherbedarf)') })
            // Nur Browser anbieten, die auf dem Gerät vorhanden sind (Buildroot-Image: nur cog)
            .filter(([v]) => !k.info.engines?.length || k.info.engines.includes(v) || d.engine === v)
            .map(([v, l]) => h('option', { value: v, selected: d.engine === v }, l)),
        );
        sel.addEventListener('change', () => (d.engine = sel.value));
        return h('div', h('label', tr('Browser auf dem Gerät')), sel);
      })(),
      (() => {
        const sel = h(
          'select',
          ...Object.entries({ auto: tr('Automatisch (an; nur Chromium auf Pi Zero 2 W / Pi 3: aus)'), on: tr('An'), off: tr('Aus (Software-Darstellung)') }).map(([v, l]) => h('option', { value: v, selected: d.gpu === v }, l)),
        );
        sel.addEventListener('change', () => (d.gpu = sel.value));
        return h('div', h('label', tr('Grafikbeschleunigung im Browser (bei weißem oder flackerndem Bild ausschalten)')), sel);
      })(),
      h('label', tr('WLAN-Netze (das Gerät verbindet sich mit dem ersten erreichbaren)')),
      wifiRows,
      h(
        'div.row',
        { style: { marginTop: '8px' } },
        h('button.small', { onclick: () => (d.wifi.push({ ssid: '', psk: '', hasPsk: false }), renderWifi()) }, icon('plus'), tr(' WLAN hinzufügen')),
        h('span.spacer'),
        pending ? h('span.small', { style: { color: '#e0a030' } }, tr('Wird beim nächsten Kontakt übertragen …')) : k.desired.rev ? h('span.small', { style: { color: 'var(--ok)' } }, icon('check'), tr(' Auf dem Gerät gespeichert (Stand {reportedRev})', { reportedRev: k.reportedRev })) : null,
        h('button.primary.small', {
          onclick: async () => {
            await put(k.id, { desired: { serverUrl: d.serverUrl, hostname: d.hostname, country: d.country, wifi: d.wifi.map((w) => ({ ssid: w.ssid, psk: w.psk })), monitor: d.ownMonitor ? sanitizeTable(d.monitor, globalTable || undefined) : null, browser: { engine: d.engine, gpu: d.gpu, flags: k.desired.browser?.flags || '' } } });
            drafts.delete(k.id);
            toast(tr('Gespeichert – das Gerät übernimmt die Einstellungen beim nächsten Kontakt.'));
          },
        }, icon('check'), tr(' Speichern & übertragen')),
      ),
      h('p.small.muted', tr('Das Gerät schaltet seine Boot-Partition dafür kurz auf Schreiben, speichert und schaltet sofort wieder auf schreibgeschützt. Eine geänderte Server-Adresse wirkt nach einem Neustart des Browsers.')),
    );
  };

  /** Monitordaten des Geräts: Auflösung, Größe, Drehung, Feinkorrektur, HDMI-Modus. */
  const monitorSection = (k, d) => {
    const m = d.monitor;
    const summary = h('div.small', { style: { margin: '6px 0' } });
    const refreshSummary = () => {
      const t = sanitizeTable(m);
      const { widthIn, heightIn } = physicalSize(t);
      const cells = tableCells(t);
      const px = cellDevicePxXY(t);
      fill(
        summary,
        tr('Bildfläche {toFixed} × {toFixed2} cm · ', { toFixed: (widthIn * 2.54).toFixed(1), toFixed2: (heightIn * 2.54).toFixed(1) }),
        h('b', tr('{floor} × {floor2} Felder', { floor: Math.floor(cells.w), floor2: Math.floor(cells.h) })),
        tr(' à 1″ · ein Feld = {toFixed} × {toFixed2} Pixel', { toFixed: px.x.toFixed(1), toFixed2: px.y.toFixed(1) }),
      );
    };
    const field = (key, label, attrs = {}) => {
      const i = h('input', { type: 'number', value: m[key], ...attrs });
      i.addEventListener('input', () => {
        m[key] = Number(i.value);
        refreshSummary();
      });
      return h('div', h('label', label), i);
    };
    const select = (key, label, options, parse = (v) => v) => {
      const sel = h('select', ...Object.entries(options).map(([v, l]) => h('option', { value: v, selected: String(m[key]) === v }, l)));
      sel.addEventListener('change', () => {
        m[key] = parse(sel.value);
        renderMode();
        refreshSummary();
      });
      return h('div', h('label', label), sel);
    };
    const sizeBox = h('div');
    const renderMode = () =>
      fill(
        sizeBox,
        m.sizeMode === 'dimensions'
          ? h('div.grid2', field('widthMm', tr('Breite der Bildfläche (mm)'), { min: 50 }), field('heightMm', tr('Höhe der Bildfläche (mm)'), { min: 50 }))
          : field('diagonalIn', tr('Diagonale (Zoll)'), { min: 5, step: 0.1 }),
      );
    renderMode();
    refreshSummary();

    // Feinkorrektur durch Nachmessen der 10-Felder-Linie im Testmuster
    const measured = h('input', { type: 'number', step: 0.1, min: 1, placeholder: tr('gemessen (cm)'), style: { width: '150px' } });
    const fineTune = h('input', { type: 'number', step: 0.001, min: 0.5, max: 2, value: m.fineTune });
    fineTune.addEventListener('input', () => {
      m.fineTune = Number(fineTune.value);
      refreshSummary();
    });
    const testing = k.display.mode === 'calibrate';
    const own = h('input', { type: 'checkbox', checked: d.ownMonitor });
    const body = h(
      'div',
      { class: d.ownMonitor ? '' : 'hidden' },
      h('div.grid3', field('resW', tr('Auflösung Breite (px)'), { min: 320 }), field('resH', tr('Auflösung Höhe (px)'), { min: 240 }), select('output', tr('HDMI-Ausgabe'), OUTPUT_MODES)),
      h('div.grid3', field('aspectW', tr('Bildformat Breite'), { min: 1, step: 0.01 }), field('aspectH', tr('Bildformat Höhe'), { min: 1, step: 0.01 }), select('rotation', tr('Drehung der Anzeige'), { 0: '0°', 90: '90°', 180: '180°', 270: '270°' }, Number)),
      h('div.grid2', select('sizeMode', tr('Größe angeben als'), { diagonal: tr('Bildschirmdiagonale'), dimensions: tr('Breite & Höhe der Bildfläche') }), sizeBox),
      summary,
      h(
        'div.row',
        h('span.small.muted', tr('Feinkorrektur')),
        h('div', { style: { width: '110px' } }, fineTune),
        h('button.small', {
          class: testing ? 'active' : '',
          title: tr('Testmuster mit 10-Felder-Linie auf diesem Gerät anzeigen'),
          onclick: () => put(k.id, { display: { campaignId: k.display.campaignId, mode: testing ? 'table' : 'calibrate' } }),
        }, icon('ruler'), testing ? tr(' Testmuster beenden') : tr(' Testmuster zeigen')),
        measured,
        h('button.small', {
          onclick: () => {
            const cm = Number(measured.value);
            if (!(cm > 0)) return toast(tr('Bitte die gemessene Länge der 10-Felder-Linie in cm eintragen.'));
            m.fineTune = Math.round(m.fineTune * ((10 * CELL_INCH * 2.54) / cm) * 10000) / 10000;
            fineTune.value = m.fineTune;
            refreshSummary();
            toast(tr('Neue Feinkorrektur {fineTune} – mit „Speichern & übertragen“ übernehmen.', { fineTune: m.fineTune }));
          },
        }, tr('Korrektur berechnen')),
      ),
      h('p.small.muted', tr('Soll: 10 Felder = 25,4 cm. Ein geänderter HDMI-Modus startet das Gerät einmal neu. Gespeichert wird auf dem Gerät selbst (kiosk.json).')),
    );
    own.addEventListener('change', () => {
      d.ownMonitor = own.checked;
      body.classList.toggle('hidden', !own.checked);
    });
    return h(
      'div',
      { style: { margin: '12px 0' } },
      h('div.section-title', icon('monitor'), tr(' Monitor')),
      h('label.inline', own, tr('Eigene Monitordaten für dieses Gerät (sonst gilt die globale TV-Kalibrierung)')),
      body,
    );
  };

  /** Systemversion, Stromversorgung und Update des Geräts. */
  const systemRow = (k) => {
    const u = k.info.update;
    const latest = updates[0];
    const p = k.info.power;
    const parts = [];
    if (p?.undervoltage || p?.undervoltageSeen) {
      parts.push(
        h(
          'div.small',
          { style: { color: '#e05050', margin: '4px 0' } },
          p.undervoltage
            ? tr('⚠ Unterspannung – die Stromversorgung reicht gerade nicht (stärkeres Netzteil bzw. anderen USB-Anschluss verwenden).')
            : tr('⚠ Seit dem Start kurzzeitig Unterspannung – die Stromversorgung ist knapp.'),
        ),
      );
    }
    const busy = u && ['download', 'install', 'reboot', 'trial'].includes(u.state);
    if (busy) {
      const label = {
        download: `Lade Update ${u.version} … ${u.progress} %`,
        install: tr('Installiere …'),
        reboot: tr('Startet neu ins neue System …'),
        trial: tr('Neues System läuft zur Probe – wird gleich übernommen'),
      }[u.state];
      parts.push(h('div.small', { style: { color: '#e0a030', margin: '4px 0' } }, icon('download'), ` ${label}`));
    } else if (u?.state === 'error') {
      parts.push(h('div.small', { style: { color: '#e05050', margin: '4px 0' } }, u.message));
    } else if (u?.state === 'done') {
      parts.push(h('div.small', { style: { color: 'var(--ok)', margin: '4px 0' } }, icon('check'), ` ${u.message}`));
    }
    if (latest && k.info.system && latest.version !== k.info.system && !busy) {
      if (!k.info.slot) {
        parts.push(h('div.small.muted', { style: { margin: '4px 0' } }, tr('System {system} – für Updates über das Netz einmal das aktuelle Image flashen.', { system: k.info.system })));
      } else {
        const install = async () => {
          const mb = Math.round(latest.size / 1048576);
          const question = tr('„{name}“ auf {version} aktualisieren? Das Gerät lädt das Update ({mb} MB), startet neu und ist dabei einige Minuten nicht verfügbar. Startet das neue System nicht, kehrt es von selbst zur bisherigen Version zurück.', { name: k.name, version: latest.version, mb });
          if (!(await confirm2(question))) return;
          try {
            await api('POST', `/api/kiosks/${k.id}/command`, { cmd: 'update', version: latest.version });
            toast(tr('Update wird beim nächsten Kontakt gestartet'));
          } catch (err) {
            toast(err.message);
          }
        };
        parts.push(
          h(
            'div.row',
            { style: { margin: '4px 0' } },
            h('span.small', tr('System {system} – Update {version} verfügbar', { system: k.info.system, version: latest.version })),
            h('button.small.primary', { disabled: !k.online, title: k.online ? '' : tr('Gerät ist offline'), onclick: install }, icon('download'), tr(' Update installieren')),
          ),
        );
      }
    }
    return parts;
  };

  /** Hochgeladene Update-Pakete für die Geräte. */
  const updatesSection = () => {
    const input = h('input', { type: 'file', accept: '.kup', class: 'hidden' });
    input.addEventListener('change', () => input.files[0] && uploadPackage(input.files[0]));
    const remove = async (u) => {
      if (!(await confirm2(tr('Update-Paket {version} löschen?', { version: u.version })))) return;
      await api('DELETE', `/api/kiosk-updates/${encodeURIComponent(u.version)}`);
      load();
    };
    return h(
      'div.card',
      h(
        'div.row',
        h('div.section-title', icon('download'), tr(' Kiosk-Updates')),
        h('span.spacer'),
        uploading !== null ? h('span.small', tr('Lade hoch … {uploading} %', { uploading })) : h('button.small', { onclick: () => input.click() }, icon('upload'), tr(' Update-Paket hochladen')),
        input,
      ),
      updates.length
        ? h(
            'div.small',
            { style: { marginTop: '6px' } },
            ...updates.map((u, i) =>
              h(
                'div.row',
                { style: { gap: '8px' } },
                h('span', i === 0 ? h('b', u.version) : u.version),
                h('span.muted', tr('{round} MB · hochgeladen {ago}', { round: Math.round(u.size / 1048576), ago: ago(u.uploadedAt) })),
                h('span.spacer'),
                h('button.small', { title: tr('Paket löschen'), onclick: () => remove(u) }, icon('trash')),
              ),
            ),
          )
        : h('p.small.muted', tr('Noch kein Update-Paket. Die Datei tabletop-forge-kiosk-<Version>.kup entsteht beim Bauen des Kiosk-Images (kiosk/dist) und enthält keine privaten Daten.')),
    );
  };

  const uploadPackage = (file) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/kiosk-updates');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      uploading = Math.round((e.loaded * 100) / e.total);
      render();
    };
    xhr.onloadend = () => {
      uploading = null;
      let msg = '';
      try {
        msg = JSON.parse(xhr.responseText).error || '';
      } catch {
        /* keine JSON-Antwort */
      }
      toast(xhr.status === 201 ? tr('Update-Paket hochgeladen') : tr('Hochladen fehlgeschlagen{x}', { x: msg ? `: ${msg}` : '' }));
      load();
    };
    uploading = 0;
    render();
    xhr.send(form);
  };

  const card = (k) => {
    const name = h('input', { value: k.name, style: { fontWeight: 'bold', maxWidth: '260px' } });
    name.addEventListener('change', () => put(k.id, { name: name.value }));
    const campSel = h('select', h('option', { value: '' }, tr('– keine Kampagne –')), ...campaigns.map((c) => h('option', { value: c.id, selected: c.id === k.display.campaignId }, c.name)));
    const modeSel = h(
      'select',
      h('option', { value: 'table', selected: k.display.mode === 'table' }, tr('Spieltisch')),
      h('option', { value: 'player', selected: k.display.mode === 'player' }, tr('Spieler-Display')),
      h('option', { value: 'calibrate', selected: k.display.mode === 'calibrate' }, tr('Testmuster (Kalibrierung)')),
    );
    const saveDisplay = () => put(k.id, { display: { campaignId: campSel.value || null, mode: modeSel.value } });
    campSel.addEventListener('change', saveDisplay);
    modeSel.addEventListener('change', saveDisplay);
    const isOpen = openSettings.has(k.id);
    return h(
      'div.card.kiosk-card',
      h('div.row', h('span.status-dot', { class: k.online ? 'on' : '' }), name, h('span.small.muted', k.online ? tr('online') : tr('offline · {ago}', { ago: ago(k.lastSeen) }))),
      k.paired === false
        ? h('div.small', { style: { color: 'var(--accent)', margin: '4px 0' } }, tr('Noch nicht freigegeben – am Bildschirm des Geräts erscheint ein QR-Code: mit dem Handy scannen und bestätigen.'))
        : null,
      k.info?.agent && agentTooOld(k.info.agent)
        ? h('div.small', { style: { color: 'var(--danger)', margin: '4px 0' } }, tr('Kiosk-Software {agent} kennt die Anmeldung noch nicht – bitte aktualisieren, bevor du unter „Benutzer & Geräte“ das erste Konto anlegst (danach kann sie keine Updates mehr laden).', { agent: k.info.agent }))
        : null,
      h('div.small.muted', { style: { margin: '4px 0 8px' } }, [k.info.ip && tr('IP {ip}', { ip: k.info.ip }), k.info.ssid && tr('WLAN „{ssid}“', { ssid: k.info.ssid }), k.info.model, k.info.system && tr('System {system}{x}', { system: k.info.system, x: k.info.slot ? tr(' (Platz {toUpperCase})', { toUpperCase: k.info.slot.toUpperCase() }) : '' }), k.info.agent && tr('Agent {agent}', { agent: k.info.agent }), Number.isFinite(k.info.power?.temp) && `${Math.round(k.info.power.temp)} °C`, tr('ID {id}', { id: k.id })].filter(Boolean).join(' · ')),
      ...systemRow(k),
      h(
        'div.row',
        h('span.small.muted', tr('Zeigt')),
        h('div', { style: { flex: 2, minWidth: '160px' } }, campSel),
        h('div', { style: { flex: 1, minWidth: '140px' } }, modeSel),
        k.display.campaignId !== cid ? h('button.small', { onclick: () => put(k.id, { display: { campaignId: cid, mode: modeSel.value } }), title: tr('Die aktuell geöffnete Kampagne zuweisen') }, tr('Diese Kampagne')) : null,
      ),
      h(
        'div.row',
        { style: { marginTop: '8px' } },
        h('button.small', { onclick: () => command(k.id, 'reload', tr('Anzeige wird neu geladen')) }, icon('rotateRight'), tr(' Neu laden')),
        h('button.small', { onclick: () => command(k.id, 'restart-browser', tr('Browser wird neu gestartet')) }, icon('monitor'), tr(' Browser neu starten')),
        h('button.small', { onclick: async () => (await confirm2(tr('„{name}“ neu starten?', { name: k.name }))) && command(k.id, 'reboot', tr('Gerät startet neu')) }, icon('rotateLeft'), tr(' Gerät neu starten')),
        h('span.spacer'),
        h('button.small', { class: isOpen ? 'active' : '', onclick: () => (isOpen ? openSettings.delete(k.id) : openSettings.add(k.id), render()) }, icon('settings'), tr(' Einstellungen')),
        h('button.small', {
          title: tr('Gerät aus der Liste entfernen (meldet es sich wieder, erscheint es erneut)'),
          onclick: async () => {
            if (!(await confirm2(tr('„{name}“ aus der Liste entfernen?', { name: k.name })))) return;
            await api('DELETE', `/api/kiosks/${k.id}`);
            load();
          },
        }, icon('trash')),
      ),
      isOpen ? settingsForm(k) : null,
      k.pendingCommands.length ? h('div.small.muted', tr('Ausstehend: {join}', { join: k.pendingCommands.join(', ') })) : null,
    );
  };

  const render = () => {
    // Nicht neu aufbauen, solange in einem Feld getippt wird
    if (el.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    fill(
      el,
      kiosks.length
        ? kiosks.map(card)
        : h('p.small.muted', tr('Noch keine Kiosk-Geräte. Ein Raspberry Pi mit dem Kiosk-Image meldet sich automatisch, sobald er die Server-Adresse kennt und im Netz ist.')),
      updatesSection(),
    );
  };

  const load = async () => {
    try {
      let settings;
      [kiosks, campaigns, settings, updates] = await Promise.all([api('GET', '/api/kiosks'), api('GET', '/api/campaigns'), api('GET', '/api/settings'), api('GET', '/api/kiosk-updates')]);
      globalTable = settings.table;
      render();
    } catch {
      /* Server kurz nicht erreichbar */
    }
  };

  sync.socket.on('kiosks', () => el.isConnected && load());
  const timer = setInterval(() => (el.isConnected ? load() : clearInterval(timer)), 15000);
  load();
  return { el, refresh: render };
}
