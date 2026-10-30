// Bildgenerator über einen öffentlichen Dienst (OpenAI-kompatibel), gegen einen Testserver.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ai-'));
const ai = await import('../server/ai.js');

const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#a33' } }).png().toBuffer();
const calls = [];
let mode = 'b64';
let port;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const type = req.headers['content-type'] || '';
    const body = type.includes('json') ? JSON.parse(raw) : raw.toString('latin1');
    calls.push({ url: req.url, auth: req.headers.authorization, type, body });
    const json = (o, status = 200) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
    if (req.url === '/download.png') return res.writeHead(200, { 'content-type': 'image/png' }), res.end(png);
    if (req.url === '/v1/models') return json({ data: [{ id: 'gpt-4o' }, { id: 'gpt-image-1' }] });
    if (req.url.startsWith('/bad')) return json({ error: { message: 'Kaputt' } }, 500);
    if (mode === 'nosize' && body.size) return json({ error: { message: 'Argument not supported: size' } }, 400);
    if (mode === 'url') return json({ data: [{ url: `http://127.0.0.1:${port}/download.png` }] });
    json({ data: [{ b64_json: png.toString('base64'), revised_prompt: 'überarbeitet' }] });
  });
});

before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  ai.saveConfig({ image: { enabled: true, provider: 'openai', url: `http://127.0.0.1:${port}`, model: 'gpt-image-1', apiKey: 'sk-test' } });
});
after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

/** Auftrag starten und auf das Ergebnis warten. */
async function run(opts) {
  let saved = null;
  const started = ai.startImage('c1', opts, async (buf, mime) => ((saved = { buf, mime }), { id: 'a1' }));
  for (let i = 0; i < 100; i++) {
    const j = ai.job(started.id);
    if (j.state !== 'running') return { j, saved };
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Auftrag läuft zu lange');
}

test('ohne Modell ist ein öffentlicher Dienst nicht aktiv', () => {
  const url = `http://127.0.0.1:${port}`;
  ai.saveConfig({ image: { enabled: true, provider: 'openai', url } });
  assert.equal(ai.status().image, false);
  ai.saveConfig({ image: { enabled: true, provider: 'openai', url, model: 'gpt-image-1', apiKey: 'sk-test' } });
  assert.equal(ai.status().image, true);
});

test('Test der Verbindung bevorzugt Bildmodelle', async () => {
  assert.deepEqual((await ai.testImage({ provider: 'openai' })).models, ['gpt-image-1']);
});

test('Arten und Größen ohne Bild-App', async () => {
  const list = await ai.workflows();
  assert.deepEqual(list.map((w) => w.file), ['token', 'battlemap', 'ortskarte', 'illustration', 'token-edit']);
  assert.deepEqual(list[0].sizes[0], ['Quadrat', 1024, 1024]);
  assert.deepEqual(list[1].sizes[0], ['Quer', 1536, 1024]);
  assert.equal(list[0].canEnhance, false);
  assert.equal(list[4].mode, 'edit');
});

test('Bild erzeugen: base64, Schlüssel, Vorgabe im Prompt', async () => {
  const { j, saved } = await run({ workflow: 'battlemap', prompt: 'Sumpf', width: 1536, height: 1024 });
  assert.equal(j.state, 'done');
  assert.equal(saved.mime, 'image/png');
  assert.deepEqual(saved.buf, png);
  assert.equal(j.prompt, 'überarbeitet');
  const c = calls.at(-1);
  assert.equal(c.url, '/v1/images/generations');
  assert.equal(c.auth, 'Bearer sk-test');
  assert.equal(c.body.size, '1536x1024');
  assert.match(c.body.prompt, /^Top-down .*Sumpf$/);
});

test('Antwort als Adresse: Download ohne Schlüssel', async () => {
  mode = 'url';
  const { j, saved } = await run({ workflow: 'token', prompt: 'Zwerg' });
  assert.equal(j.state, 'done');
  assert.deepEqual(saved.buf, png);
  assert.equal(calls.at(-1).auth, undefined);
});

test('Dienst ohne Feld „size“: zweiter Versuch ohne Größe', async () => {
  mode = 'nosize';
  const { j } = await run({ workflow: 'token', prompt: 'Zwerg', width: 1024, height: 1024 });
  assert.equal(j.state, 'done');
  assert.equal(calls.at(-1).body.size, undefined);
});

test('Bild bearbeiten geht als Formular an /images/edits', async () => {
  mode = 'b64';
  const { j } = await run({ workflow: 'token-edit', prompt: 'Token', image: png });
  assert.equal(j.state, 'done');
  const c = calls.at(-1);
  assert.equal(c.url, '/v1/images/edits');
  assert.match(c.type, /multipart\/form-data/);
});

test('Fehler des Dienstes kommt beim Auftrag an', async () => {
  ai.saveConfig({ image: { enabled: true, provider: 'openai', url: `http://127.0.0.1:${port}/bad`, model: 'm', apiKey: 'k' } });
  const { j } = await run({ workflow: 'token', prompt: 'x' });
  assert.equal(j.state, 'error');
  assert.match(j.error, /^500/);
});
