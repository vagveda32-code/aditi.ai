// गोपथ ब्राह्मण में खोज (BM25) — कण्डिका-वार
import G from "./gopatha-data.mjs";
import { terms, excerpt } from "./search.mjs";

const docs = G.map((r) => { const tf = new Map(); for (const t of terms(r.t + " " + r.t + " " + r.x)) tf.set(t, (tf.get(t) || 0) + 1); let len = 0; for (const v of tf.values()) len += v; return { tf, len }; });
const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
const df = new Map(); for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
const toNum = (x) => +String(x).replace(/[०-९]/g, (c) => "०१२३४५६७८९".indexOf(c));
export const GOPATHA_RE = /गोपथ|ब्राह्मण\s*ग्रंथ|ब्राह्मण\s*ग्रन्थ|ब्राह्मणम्|gopath|brahmana/i;
export const label = (r) => `गोपथ ब्राह्मण, ${r.g}भाग, प्रपाठक ${r.p}, कण्डिका ${r.k}`;

export function gsearch(q, n = 2) {
  // सीधा संदर्भ: "पूर्व 1.3", "उत्तर भाग 2/5", "गोपथ 1.1.3"
  const m = q.match(/(पूर्व|पुर्व|उत्तर|purva|uttara)\D{0,12}?(\d{1,2}|[०-९]{1,2})\s*[.।/:,\s]\s*(?:कण्डिका|कंडिका)?\s*(\d{1,2}|[०-९]{1,2})/i);
  if (m) { const g = /उ|utt/i.test(m[1]) ? "उत्तर" : "पूर्व"; const hit = G.find((r) => r.g === g && r.p === toNum(m[2]) && r.k === toNum(m[3])); if (hit) return [hit]; }
  const qt = [...new Set(terms(q))].filter((t) => !/^(गोपथ|ब्राह्मण|ब्राह्मणम्|ग्रंथ|ग्रन्थ|क्या|बताओ|बताइए|है|में)$/.test(t));
  if (!qt.length) return [];
  const N = G.length, sc = [];
  docs.forEach((d, i) => { let s = 0; for (const t of qt) { const f = d.tf.get(t); if (!f) continue; const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5)); s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / avg)); } if (s > 0) sc.push([s, i]); });
  sc.sort((a, b) => b[0] - a[0]);
  return sc.slice(0, n).map(([, i]) => G[i]);
}
export const gcontext = (hits, q) => hits.map((r, i) => `[${label(r)}${r.t ? " | विषय: " + r.t : ""}]\n` + excerpt(r.x, q, i ? 900 : 2200)).join("\n\n");
export const gsummary = () => {
  const c = {}; for (const r of G) { const k = r.g + " " + r.p; c[k] = (c[k] || 0) + 1; }
  return "[गोपथ ब्राह्मण का ढाँचा] दो भाग: पूर्वभाग (5 प्रपाठक, 135 कण्डिकाएँ) और उत्तरभाग (6 प्रपाठक, 123 कण्डिकाएँ) — कुल 11 प्रपाठक, 258 कण्डिकाएँ। यह अथर्ववेद का ब्राह्मण ग्रंथ है। आरम्भ: \"ओं ब्रह्म ह वा इदमग्र आसीत्\"।";
};
