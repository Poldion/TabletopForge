// Update-Pakete für Kiosk-Geräte (.kup aus dem Buildroot-Build): werden im DM-System hochgeladen und vom
// Kiosk-Agenten direkt in seinen freien Systemplatz geladen. Ein Paket ist ein tar-Archiv mit manifest.json
// als erstem Eintrag, danach boot.tar und rootfs.squashfs (Prüfsummen im Manifest).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';

export const DIR = path.join(DATA_DIR, 'kiosk-updates');
const KEEP = 3; // ältere Pakete werden beim Hochladen eines neuen gelöscht

export const isVersion = (v) => typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(v);
const fileFor = (version) => path.join(DIR, `${version}.kup`);

/** Manifest (erster Eintrag des tar-Archivs) lesen, ohne das ganze Paket zu laden. */
function readManifest(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(512);
    if (fs.readSync(fd, head, 0, 512, 0) !== 512) return null;
    const name = head.toString('utf8', 0, 100).replace(/\0.*$/s, '').replace(/^\.\//, '');
    const size = parseInt(head.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim(), 8);
    if (name !== 'manifest.json' || !(size > 0 && size < 65536)) return null;
    const body = Buffer.alloc(size);
    fs.readSync(fd, body, 0, size, 512);
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Neueste Version zuerst (Zahlenteile numerisch verglichen). */
const compare = (a, b) => b.localeCompare(a, undefined, { numeric: true });

export function list() {
  let names = [];
  try {
    names = fs.readdirSync(DIR).filter((n) => n.endsWith('.kup'));
  } catch {
    return [];
  }
  return names
    .map((n) => {
      const file = path.join(DIR, n);
      const m = readManifest(file);
      if (!m) return null;
      const st = fs.statSync(file);
      return { version: String(m.version), board: m.board, created: m.created || null, size: st.size, uploadedAt: st.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => compare(a.version, b.version));
}

export const latest = () => list()[0] || null;
export const filePath = (version) => (isVersion(version) && fs.existsSync(fileFor(version)) ? fileFor(version) : null);

/** Hochgeladenes Paket prüfen und ablegen. Rückgabe: Eintrag oder Fehlertext. */
export function add(tmpFile) {
  const m = readManifest(tmpFile);
  if (!m || m.format !== 1 || !m.boot?.sha256 || !m.rootfs?.sha256) {
    fs.rmSync(tmpFile, { force: true });
    return { error: 'Kein gültiges Kiosk-Update-Paket (.kup)' };
  }
  const version = String(m.version);
  if (!isVersion(version)) {
    fs.rmSync(tmpFile, { force: true });
    return { error: 'Ungültige Versionsnummer im Paket' };
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.renameSync(tmpFile, fileFor(version));
  for (const old of list().slice(KEEP)) fs.rmSync(fileFor(old.version), { force: true });
  return list().find((u) => u.version === version);
}

export function remove(version) {
  const file = filePath(version);
  if (!file) return false;
  fs.rmSync(file, { force: true });
  return true;
}
