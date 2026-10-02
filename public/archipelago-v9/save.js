// Progress persistence (localStorage, failure-tolerant).
const KEY = 'five-lights-save-v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && o.v === 1 ? o : null;
  } catch (e) {
    return null;
  }
}

export function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...o })); } catch (e) { /* storage unavailable */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
