// अथर्ववेद (शौनक संहिता) में खोज — दो ग्रंथ:
//   A = अथर्ववेद संहिता भाग 1-2 (मानक काण्ड-सूक्त क्रम; ऋषि, देवता, छन्द, सूक्त का नाम, मंत्र + भावार्थ + टिप्पणी)
//   B = दूसरा हिंदी अनुवाद (मंत्र + अर्थ) — A के सूक्त से मिलान करके "दूसरा अर्थ" के रूप में, और A में सूक्त न मिले तो सहारा
// A: { k, s, t: नाम, r: ऋषि, d: देवता, c: छन्द, x: पाठ, b: B का मिलता सूक्त (index) या -1 }
// B: { k, s, d, t, x }
import DATA from "./data.mjs";
const A = DATA.A, B = DATA.B;

const DIGITS = { "०": 0, "१": 1, "२": 2, "३": 3, "४": 4, "५": 5, "६": 6, "७": 7, "८": 8, "९": 9,
  "೦": 0, "೧": 1, "೨": 2, "೩": 3, "೪": 4, "೫": 5, "೬": 6, "೭": 7, "೮": 8, "೯": 9,
  "౦": 0, "౧": 1, "౨": 2, "౩": 3, "౪": 4, "౫": 5, "౬": 6, "౭": 7, "౮": 8, "౯": 9 };
const toAscii = (s) => s.replace(/[०-९೦-೯౦-౯]/g, (c) => DIGITS[c]);

// काण्ड के लिए हिंदी क्रम-शब्द (1–20)
const NUMW = [
  [/पहल|प्रथम/, 1], [/दूसर|द्वितीय/, 2], [/तीसर|तृतीय/, 3], [/चौथ|चतुर्थ/, 4], [/पांच|पाँच|पंचम/, 5],
  [/छठ|षष्ठ/, 6], [/सातव|सप्तम/, 7], [/आठव|अष्टम/, 8], [/नौव|नवम/, 9], [/दसव|दशम/, 10],
  [/ग्यारह|एकादश/, 11], [/बारह|द्वादश/, 12], [/तेरह|त्रयोदश/, 13], [/चौदह|चतुर्दश/, 14], [/पंद्रह|पन्द्रह|पंचदश/, 15],
  [/सोलह|षोडश/, 16], [/सत्रह|सप्तदश/, 17], [/अठारह|अष्टादश/, 18], [/उन्नीस|एकोनविंश/, 19], [/बीसव|विंश/, 20],
];

// प्रसिद्ध सूक्त → [काण्ड, सूक्त] (मानक शौनक क्रम)
const ALIASES = [
  [/पुरुष\s*-?\s*सूक्त|पुरूष\s*सूक्त|सहस्रशीर्षा|purush(?:a)?\s*-?\s*s(?:u|oo)kt/i, [19, 6]],
  [/भूमि\s*सूक्त|भू\s*-?\s*सूक्त|भूसूक्त|भुसुक्त|भू\s*सुक्त|\bbh(?:u|oo)\s*-?\s*s(?:u|oo)kt|पृथ्वी\s*सूक्त|पृथिवी\s*सूक्त|माता\s*भूमि|पृथ्वी.{0,20}माता|माता.{0,20}पृथ्वी|bhumi|prithvi|ಭೂಮಿ|భూమి/i, [12, 1]],
  [/ब्रह्मचर्य\s*सूक्त|ब्रह्मचारी\s*सूक्त|brahmachar/i, [11, 5]],
  [/काल\s*सूक्त|kaal\s*sukt|kala\s*sukt/i, [19, 53], [19, 54]],
  [/स्कम्भ|स्कंभ|skambh/i, [10, 7]],
  [/प्राण\s*सूक्त|prana\s*sukt/i, [11, 4]],
  [/रोहित\s*सूक्त|rohit/i, [13, 1]],
  [/उच्छिष्ट|uchchhisht|ucchisht/i, [11, 7]],
  [/सांमनस्य|सामनस्य|सौमनस्य|saamanasy|samanasy/i, [3, 30]],
  [/विवाह|vivah|सूर्या\s*सूक्त/i, [14, 1], [14, 2]],
  [/शाला|घर\s*(बनाने|निर्माण)|वास्तु|vastu|shala/i, [3, 12], [9, 3]],
  [/कुंताप|कुन्ताप|kuntap/i, [20, 127]],
  [/व्रात्य|vratya/i, [15, 1]],
  [/वेदमाता|गायत्री\s*सूक्त|vedamata/i, [19, 71]],
  [/मधु\s*विद्या|मधुविद्या|मधुकशा|madhu\s*vidya/i, [9, 1]],
  [/मेधा\s*सूक्त|मेधाजनन|medha/i, [1, 1]],
  [/अदिति\s*(देवी|माता|सूक्त)|देवी\s*अदिति|माता\s*अदिति|aditi\s*(devi|sukt)/i, [7, 6], [7, 7]],
  [/गौ|गाय|गो\s*सूक्त|गोमाता|gau\s*sukt|cow/i, [4, 21], [9, 12]],
];

const norm = (s) => s.normalize("NFC").replace(/़/g, "").replace(/ँ/g, "ं").replace(/[॰ऽ॒॑ः:]/g, "");
const STOP = new Set(("का की के को में से है हैं और या भी तो यह वह इस उस एक कर करो बताओ बताइए बताएं बताइये बताना बताये क्या कौन कौनसा कौन-सा " +
  "सूक्त सूक्तों मंत्र मंत्रों अर्थ महत्त्व महत्व संदेश देवता ऋषि कांड काण्ड संख्या मुझे हमें आप तुम अदिति अथर्ववेद वेद " +
  "स्तुति स्तुतियों वर्णन प्रशंसा आराधना देव देवी देवों कामना प्रार्थना जी कृपया दो दीजिए लिए बारे सुनाओ सुनाइए स्क्रिप्ट वॉइसओवर चाहिए होता होती गया गई जाता जाती करता करती करते हे " +
  "वीडियो विडियो मिनट सेकंड बनाइए बनाओ बनाना छन्द छंद").split(" "));
const stem = (w) => w.replace(/(ियों|ाओं|ाएं|ाएँ|ों|ें|ीं|ियां|ियाँ|ाओ|ता|ती|ते|ना|नी|ने|ी|ा|े|ो|ि|ु)$/u, "");
const words = (s) => (norm(s).match(/[ऀ-ॿ]+|[a-z]+/gi) || []).map((w) => w.toLowerCase());
export const terms = (s) => words(s).filter((w) => w.length > 1 && !STOP.has(w)).map(stem).filter((w) => w.length > 1);

// ---- index (cold start पर एक बार) ----
function buildIndex(list, fieldsW) {
  const docs = list.map((r, i) => {
    const tf = new Map();
    for (const [f, w] of fieldsW) for (const t of terms(r[f] || "")) tf.set(t, (tf.get(t) || 0) + w);
    let len = 0; for (const v of tf.values()) len += v;
    return { i, tf, len };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { list, docs, df, avg };
}
const IA = buildIndex(A, [["t", 6], ["d", 5], ["r", 3], ["x", 1]]);
const IB = buildIndex(B, [["t", 3], ["d", 6], ["x", 1]]);
const BYA = new Map(A.map((r, i) => [r.k + "." + r.s, i]));

function score(ix, qt, kOnly) {
  const N = ix.docs.length, out = [];
  for (const d of ix.docs) {
    if (kOnly && ix.list[d.i].k !== kOnly) continue;
    let sc = 0;
    for (const t of qt) {
      const f = d.tf.get(t); if (!f) continue;
      const df = ix.df.get(t);
      sc += Math.log(1 + (N - df + 0.5) / (df + 0.5)) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / ix.avg));
    }
    if (sc > 0) out.push([sc, d.i]);
  }
  return out.sort((a, b) => b[0] - a[0]);
}

function explicitRef(q) {
  const s = toAscii(q);
  let m = s.match(/(\d{1,2})\s*[.\/:,-]\s*(\d{1,3})/);
  if (m && BYA.has(+m[1] + "." + +m[2])) return [+m[1], +m[2]];
  let k = null, su = null;
  const KW = "(?:कांड|काण्ड|कान्ड|kand|kaand|ಕಾಂಡ|కాండ)";
  for (const [re, n] of NUMW) if (new RegExp("(" + re.source + ")\\S*\\s*(कांड|काण्ड)").test(s)) { k = n; break; }
  if (!k) {
    m = s.match(new RegExp("(\\d{1,2})\\D{0,6}" + KW, "i")) || s.match(new RegExp(KW + "\\D{0,6}(\\d{1,2})", "i"));
    if (m && +m[1] >= 1 && +m[1] <= 20) k = +m[1];
  }
  m = s.match(/(?:सूक्त|sukt|ಸೂಕ್ತ|సూక్త)\D{0,6}(\d{1,3})/i) || s.match(/(\d{1,3})\D{0,8}(?:सूक्त|sukt|ಸೂಕ್ತ|సూక్త)/i);
  if (m) su = +m[1];
  if (k && su === k && (s.match(/\d{1,3}/g) || []).length === 1) su = null;
  if (k && su && BYA.has(k + "." + su)) return [k, su];
  if (k && !su) return [k, 0];
  return null;
}


// नाम से सूक्त ढूँढना — वर्तनी अलग हो तब भी (भुवनस्पति ≈ भुवनपति, Bhuvanaspati ≈ भुवनपति)
const DV = { "क":"k","ख":"k","ग":"g","घ":"g","ङ":"n","च":"c","छ":"c","ज":"j","झ":"j","ञ":"n","ट":"t","ठ":"t","ड":"d","ढ":"d","ण":"n","त":"t","थ":"t","द":"d","ध":"d","न":"n","प":"p","फ":"p","ब":"b","भ":"b","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"s","ष":"s","स":"s","ऋ":"r","ॠ":"r" };
function skel(w) {
  if (/[ऀ-ॿ]/.test(w)) return [...w].map((c) => DV[c] || "").join("");
  return w.toLowerCase().replace(/ch/g, "c").replace(/sh/g, "s").replace(/w/g, "v").replace(/[zq]/g, (c) => ({ z: "j", q: "k" })[c]).replace(/[^bcdgjklmnprstvy]/g, "");
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
const SUK = /^(?:सूक्त\S*|सूक्तम्|sukta\S*|sukth\S*|suktam|hymn)$/i;
const TITLES = A.map((r, i) => { const w = String(r.t || "").split(/[\s\-–,()]+/).filter((x) => x && !SUK.test(x)); return [i, skel(w.join("")), w.length ? skel(w[w.length - 1]) : ""]; }).filter(([, a]) => a.length >= 3);
function byName(query) {
  const words = query.replace(/[?।.,!"“”']/g, " ").split(/\s+/).filter(Boolean);
  const cands = [];
  words.forEach((w, i) => { if (SUK.test(w)) { if (i > 0) cands.push(words[i - 1]); if (i > 1) cands.push(words[i - 2] + words[i - 1]); } });
  // जुड़ा हुआ नाम: "Purushasukta", "पुरुषसूक्त", "Medhasuktam"
  for (const w of words) { const m = w.match(/^(.{2,}?)(?:सूक्त\S*|सुक्त\S*|सूक्‍त\S*|s(?:u|oo)kt\S*)$/i); if (m) cands.push(m[1].replace(/[aA]$/, "")); }
  const hits = [];
  for (const c of cands) {
    const sk = skel(c); if (sk.length < 3) continue;
    for (const [i, full, last] of TITLES) {
      const d = Math.min(lev(sk, full), full === last ? 9 : lev(sk, last));
      const lim = sk.length >= 6 ? 2 : sk.length >= 4 ? 1 : 0;
      if (d <= lim) hits.push([d, i]);
    }
  }
  return hits.sort((a, b) => a[0] - b[0]).map(([, i]) => i);
}
// परिणाम: { k, s, t, r, d, c, x, y (दूसरे ग्रंथ का पाठ, हो तो) }
const withB = (r) => ({ ...r, y: r.b >= 0 ? B[r.b].x : "" });
export function search(query, n = 3) {
  const out = [], seen = new Set();
  const push = (i) => { if (i != null && !seen.has(i)) { seen.add(i); out.push(withB(A[i])); } };
  const ref = explicitRef(query);
  if (ref && ref[1]) push(BYA.get(ref[0] + "." + ref[1]));
  for (const [re, ...refs] of ALIASES) if (re.test(query)) for (const [k, s] of refs) push(BYA.get(k + "." + s));
  for (const i of byName(query).slice(0, 2)) push(i);
  const qt = [...new Set(terms(query))];
  const kOnly = ref && !ref[1] ? ref[0] : null;
  if (qt.length) {
    const sa = score(IA, qt, kOnly), top = sa[0]?.[0] || 0;
    for (const [sc, i] of sa) { if (out.length >= n || sc < top * 0.45) break; push(i); }
    if (!out.length) {                       // A में कुछ न मिले तो B से सहारा
      const sb = score(IB, qt, kOnly);
      for (const [, i] of sb.slice(0, n)) out.push({ ...B[i], r: "", c: "", y: "", src: "B" });
    }
  } else if (kOnly) {
    for (const r of A.filter((r) => r.k === kOnly).slice(0, n)) push(BYA.get(r.k + "." + r.s));
  }
  return out.slice(0, n);
}

export const kandaTopics = (k) => A.filter((r) => r.k === k).map((r) => `${r.s}: ${r.t || r.d}`).join("; ");
export const COUNT = A.length;

// लंबे पाठ से अंश: शुरुआत + प्रश्न से मेल खाते मंत्र (मूल क्रम में)
export function excerpt(text, query, max = 3200) {
  if (!text) return "";
  if (text.length <= max) return text;
  const blocks = text.split(/(?<=(?:\(\s*[०-९\d]+\s*\)|॥\s*[०-९\d]+\s*॥))\s*\n/);
  const qt = new Set(terms(query));
  const scored = blocks.map((b, i) => {
    let sc = 0; for (const t of terms(b)) if (qt.has(t)) sc++;
    return { i, b, sc: i < 2 ? 1000 - i : sc };
  });
  const pick = new Set(); let len = 0;
  for (const s of [...scored].sort((a, b) => b.sc - a.sc || a.i - b.i)) {
    if (len + s.b.length > max) continue;
    pick.add(s.i); len += s.b.length;
  }
  const idx = [...pick].sort((a, b) => a - b);
  let out = "", prev = -1;
  for (const i of idx) { out += (prev >= 0 && i !== prev + 1 ? "\n…\n" : prev >= 0 ? "\n" : "") + blocks[i]; prev = i; }
  return out + "\n…(शेष मंत्र यहाँ नहीं दिए गए)";
}

// पूरा सूक्त (पढ़ने के पन्ने के लिए) और सूची
export function getSukta(k, s) { const i = BYA.get(k + "." + s); return i == null ? null : withB(A[i]); }
export const indexList = () => A.map((r) => [r.k, r.s, r.t, r.r, r.d]);
// सूक्त का पहला मंत्र (संख्या वाली पंक्ति से "॥1॥" तक)
export function firstMantra(x) {
  const L = (x || "").split("\n"); let out = [], on = false;
  for (const l of L) {
    if (!on && /^\s*(?:[०-९\d]{1,5}|\$)\s*[.,]\s*[^\s\d०-९,\-–(]/.test(l)) on = true;
    if (on) { out.push(l.replace(/^\s*(?:[०-९\d]{1,5}|\$)\s*[.,]\s*/, "")); if (/॥\s*[०-९\d]{1,2}\s*॥/.test(l) || out.length >= 3) break; }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
