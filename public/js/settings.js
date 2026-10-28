import { $, api, toast } from './util.js';
import { physicalSize, cellDevicePxXY, tableCells, CELL_INCH } from '/shared/calibration.js';
import { tr } from './i18n.js';

const form = $('#form');
const NUM = ['resW', 'resH', 'aspectW', 'aspectH', 'diagonalIn', 'widthMm', 'heightMm', 'fineTune', 'rotation'];

let settings = await api('GET', '/api/settings');

function fill(t) {
  for (const k of NUM) form.elements[k].value = t[k];
  form.elements.sizeMode.value = t.sizeMode;
  update();
}

function read() {
  const t = { ...settings.table };
  for (const k of NUM) {
    const v = parseFloat(form.elements[k].value);
    if (Number.isFinite(v)) t[k] = v;
  }
  t.sizeMode = form.elements.sizeMode.value;
  return t;
}

function update() {
  const t = read();
  $('#diag').classList.toggle('hidden', t.sizeMode !== 'diagonal');
  $('#dims').classList.toggle('hidden', t.sizeMode !== 'dimensions');
  const { widthIn, heightIn } = physicalSize(t);
  const cells = tableCells(t);
  const diag = Math.hypot(widthIn, heightIn);
  $('#summary').innerHTML = `
    Bildfläche: <b>${(widthIn * 2.54).toFixed(1)} × ${(heightIn * 2.54).toFixed(1)} cm</b>
    (${widthIn.toFixed(2)}″ × ${heightIn.toFixed(2)}″, Diagonale ${diag.toFixed(1)}″)<br>
    Pixeldichte: <b>${(t.resW / widthIn).toFixed(1)} ppi</b><br>
    Ein Rasterfeld (1″ × 1″ = 2,54 cm): <b>${cellDevicePxXY(t).x.toFixed(1)} × ${cellDevicePxXY(t).y.toFixed(1)} Gerätepixel</b><br>
    Sichtbare Felder auf dem Tisch: <b>${Math.floor(cells.w)} × ${Math.floor(cells.h)}</b>`;
}

form.addEventListener('input', update);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  settings = await api('PUT', '/api/settings', { table: read() });
  toast(tr('Kalibrierung gespeichert – der Spieltisch übernimmt sie sofort.'));
});

$('#applyMeasure').addEventListener('click', () => {
  const measuredCm = parseFloat($('#measured').value);
  if (!(measuredCm > 0)) return;
  const t = read();
  const expectedCm = 10 * CELL_INCH * 2.54;
  // Gemessen zu groß -> Pixel pro Zoll werden überschätzt -> Faktor verkleinern
  const next = t.fineTune * (expectedCm / measuredCm);
  form.elements.fineTune.value = next.toFixed(4);
  update();
  toast(tr('Neuer Korrekturfaktor: {toFixed} – zum Übernehmen speichern.', { toFixed: next.toFixed(4) }));
});

fill(settings.table);
