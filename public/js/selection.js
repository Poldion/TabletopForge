// Gemeinsame Token-Auswahl der Spielleitung: Karte und Kampf-Tab zeigen dieselbe Auswahl.
// source: wer die Auswahl geändert hat ('map' | 'combat') – so reagiert niemand auf seine eigene Änderung.
const listeners = new Set();

export const tokenSelection = {
  ids: new Set(),
  set(ids, source) {
    const next = new Set(ids);
    if (next.size === this.ids.size && [...next].every((id) => this.ids.has(id))) return;
    this.ids = next;
    for (const fn of listeners) fn(this.ids, source);
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
