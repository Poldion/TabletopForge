// Sprachpakete vollständig? Jeder Text der Oberfläche (tr('…') im Code, data-t in den Seiten) braucht eine
// englische Übersetzung mit denselben Platzhaltern. Neue Texte ohne Übersetzung fallen hier auf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import en from '../public/i18n/en.js';

const unquote = (q, s) => (q === "'" ? s.replace(/\\'/g, "'") : s.replace(/\\"/g, '"')).replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

function codeKeys() {
  const keys = new Set();
  for (const f of fs.readdirSync('public/js')) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join('public/js', f), 'utf8');
    for (const m of src.matchAll(/(?<![\w.$])tr\((['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(unquote(m[1], m[2]));
  }
  return keys;
}

const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

test('jeder Oberflächentext hat eine englische Übersetzung', () => {
  const missing = [...codeKeys()].filter((k) => !(k in en));
  assert.deepEqual(missing, [], `Fehlende Übersetzungen in public/i18n/en.js:\n${missing.join('\n')}`);
});

test('Übersetzungen nutzen nur vorhandene Platzhalter', () => {
  const bad = Object.entries(en).filter(([k, v]) => ph(v).some((p) => !ph(k).includes(p)));
  assert.deepEqual(bad, []);
});

test('feste Texte der Seiten (data-t) sind übersetzt', () => {
  const missing = [];
  for (const f of fs.readdirSync('public').filter((x) => x.endsWith('.html'))) {
    const src = fs.readFileSync(path.join('public', f), 'utf8');
    for (const m of src.matchAll(/<(\w+)[^>]*\sdata-t>([^<]+)</g)) {
      const key = m[2].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      if (!(key in en)) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
