// अदिति का "सीखना" — लोग जो नई बात सिखाएँ, उसे जाँचकर (वेद से जुड़ी, सम्मानजनक, ग्रंथ से न टकराए) याद रखना।
// सीखी बातें Netlify Blobs में रहती हैं — सबके लिए, हर deploy के बाद भी।
import { getStore } from "@netlify/blobs";
import { terms } from "./search.mjs";

const KEY = "facts";
const store = () => getStore({ name: "aditi-learned", consistency: "strong" });
let cache = null, cacheAt = 0;

export async function allFacts(fresh = false) {
  if (!fresh && cache && Date.now() - cacheAt < 60_000) return cache;
  try { cache = (await store().get(KEY, { type: "json" })) || []; } catch { cache = cache || []; }
  cacheAt = Date.now();
  return cache;
}
async function saveFacts(list) { await store().setJSON(KEY, list); cache = list; cacheAt = Date.now(); }

// प्रश्न से मिलती सीखी बातें (सबसे ज़्यादा 3)
export async function relevantFacts(q, n = 3) {
  const list = await allFacts(); if (!list.length) return [];
  const qt = new Set(terms(q)); if (!qt.size) return [];
  return list.map((f) => { let sc = 0; for (const t of terms(f.fact + " " + (f.topic || ""))) if (qt.has(t)) sc++; return [sc, f]; })
    .filter(([sc]) => sc >= 2).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, f]) => f);
}

// नई बात जाँचो और (सही हो तो) जोड़ो
export async function teach(text, ctx, chat) {
  const prompt = `तुम अथर्ववेद-सहायिका "अदिति" के ज्ञान के रखवाले हो। एक उपयोगकर्ता अदिति को कुछ सिखाना चाहता है।
सिखाई गई बात: """${text.slice(0, 800)}"""

ग्रंथ-अंश (जाँच के लिए):
${ctx || "(कोई मिलता अंश नहीं)"}

जाँचो:
1. vedic: क्या यह वेद, वैदिक मंत्र, सूक्त, ऋषि, देवता, यज्ञ, वैदिक संस्कृति या संस्कृत-अर्थ से जुड़ी बात है?
2. safe: क्या यह सम्मानजनक है — कोई अपमान, नफ़रत, जाति/धर्म/लिंग के विरुद्ध बात, अश्लीलता, हिंसा, ख़तरनाक चिकित्सा/दवा का दावा, अंधविश्वास से नुकसान, राजनीति, विज्ञापन या निजी जानकारी नहीं है?
3. consistent: ग्रंथ-अंश से तुलना — "yes" (मेल खाती है), "no" (ग्रंथ से टकराती है या स्पष्ट रूप से गलत तथ्य है), "unknown" (ग्रंथ में नहीं, पर सामान्य वैदिक ज्ञान के अनुसार संभव है)।
4. fact: सिखाई गई बात को एक-दो साफ़, सरल हिंदी वाक्यों में लिखो (अपनी ओर से कुछ मत जोड़ो)।
5. topic: किस सूक्त/देवता/विषय से जुड़ी है (छोटा), sukta: "काण्ड.सूक्त" पता हो तो, वरना ""।
6. reason: अगर स्वीकार न हो तो एक छोटे वाक्य में कारण (हिंदी में)।
सिर्फ़ यह JSON दो, और कुछ नहीं:
{"vedic":true,"safe":true,"consistent":"yes","fact":"...","topic":"...","sukta":"","reason":""}`;
  const raw = await chat(prompt);
  const m = raw.match(/\{[\s\S]*\}/);
  let j; try { j = JSON.parse(m ? m[0] : raw); } catch { return { ok: false, reason: "जाँच पूरी नहीं हो सकी, कृपया दोबारा साफ़ शब्दों में सिखाइए।" }; }
  const ok = j.vedic === true && j.safe === true && j.consistent !== "no" && typeof j.fact === "string" && j.fact.trim().length > 5;
  if (!ok) {
    const why = j.reason || (!j.vedic ? "यह बात वेद से जुड़ी नहीं लगती।" : !j.safe ? "यह बात सम्मानजनक या सुरक्षित नहीं लगती।" : "यह बात ग्रंथ से मेल नहीं खाती।");
    return { ok: false, reason: why };
  }
  const list = await allFacts(true);
  const fact = j.fact.trim().slice(0, 400);
  // पहले से सीखी हो तो दोबारा नहीं
  const ft = new Set(terms(fact));
  const dup = list.find((f) => { const a = terms(f.fact); const same = a.filter((t) => ft.has(t)).length; return same >= Math.max(3, Math.min(a.length, ft.size) * 0.8); });
  if (dup) return { ok: true, fact: dup.fact, dup: true };
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), fact, topic: String(j.topic || "").slice(0, 80), sukta: String(j.sukta || "").slice(0, 10), check: j.consistent, ts: Date.now() };
  list.unshift(item);
  await saveFacts(list.slice(0, 500));
  return { ok: true, fact, id: item.id };
}

export async function forget(id) {
  const list = await allFacts(true);
  const next = list.filter((f) => f.id !== id);
  if (next.length === list.length) return false;
  await saveFacts(next); return true;
}
