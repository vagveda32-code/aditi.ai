// Aditi voice backend — keeps the Sarvam key on the server.
// Routes: POST /api/aditi?a=stt  (multipart "file": WAV, "lang")        -> { text }
//         POST /api/aditi?a=chat (JSON { messages, lang })             -> { reply, refs }
//         POST /api/aditi?a=tts  (JSON { text, lang })                 -> { audios: [base64 wav, ...] }
import { search, kandaTopics, excerpt, getSukta, indexList, firstMantra } from "./search.mjs";
import { teach, relevantFacts, allFacts, forget } from "./learn.mjs";

// key: पहले Netlify Environment variable, न हो तो यह (यह फ़ाइल website पर public नहीं होती)
// सीखी बातें हटाने का PIN (Netlify में ADMIN_PIN environment variable डालकर बदल सकते हैं)
const ADMIN_PIN = process.env.ADMIN_PIN || "460860";
const KEY = process.env.SARVAM_API_KEY || "sk_oubrr5y6_hhhWZoweMp6fgIAZU3NOKGC7";
const BASE = "https://api.sarvam.ai";

// भाषा → Sarvam code, आवाज़ (bulbul:v4-flash), जवाब की भाषा का नाम
const LANGS = {
  hi: { code: "hi-IN", voice: "ishita_hi_devotional", name: "सरल हिंदी (देवनागरी लिपि)" },
  kn: { code: "kn-IN", voice: "suchitra_kn_narration", name: "सरल कन्नड़ (ಕನ್ನಡ लिपि)" },
  en: { code: "en-IN", voice: "chandrika_en_stories", name: "simple English (Roman script)" },
  te: { code: "te-IN", voice: "pooja_te_conversation", name: "सरल तेलुगु (తెలుగు लिपि)" },
  mr: { code: "mr-IN", voice: "neha_mr_narration", name: "सरल मराठी (देवनागरी लिपि)" },
  // संस्कृत: सुनना sa-IN में; Sarvam में संस्कृत आवाज़ नहीं, इसलिए हिंदी (देवनागरी) भक्तिमय आवाज़ बोलती है
  sa: { code: "sa-IN", tts: "hi-IN", voice: "ishita_hi_devotional", name: "सरल संस्कृत (देवनागरी लिपि) — छोटे, शुद्ध, सरल वाक्य" },
  ta: { code: "ta-IN", voice: "gokul_ta_narration", name: "सरल तमिल (தமிழ் लिपि)" },
  bn: { code: "bn-IN", voice: "roopa_bn_conversational", name: "सरल बांग्ला (বাংলা लिपि)" },
  gu: { code: "gu-IN", voice: "pooja_gu_conversational", name: "सरल गुजराती (ગુજરાતી लिपि)" },
  pa: { code: "pa-IN", voice: "harpreet_pa_narration", name: "सरल पंजाबी (ਗੁਰਮੁਖੀ लिपि)" },
};
const L = (x) => LANGS[x] || LANGS.hi;

const system = (lang, ctx, learned = "") => `तुम "अदिति" हो — अथर्ववेद सूक्तों की मित्रवत सहायिका।
- तुम्हारी पहचान: तुम "अदिति" नाम की AI सहायिका हो — अथर्ववेद की सहायिका। तुम अथर्ववेद के सूक्तों का अर्थ और महत्त्व बताती हो और वीडियो-स्क्रिप्ट बनाने में मदद करती हो। तुम्हारा आधार ऐप में दिया अथर्ववेद ग्रंथ है।
- उत्तर में किसी अनुवादक, लेखक, संपादक या पुस्तक का नाम कभी मत लो ("मेरे पास फलाँ के अनुवाद पर आधारित जानकारी है" जैसा मत कहो)। ज़रूरत हो तो बस "अथर्ववेद के अनुसार" कहो।
- कोई पूछे "तुम कौन हो / तुम्हें किसने बनाया / तुम क्या कर सकती हो", तो ऊपर वाली पहचान ही एक-दो वाक्यों में बताओ। तुम स्वयं देवी अदिति नहीं हो, न ही कोई ऋषि या पंडित; अपने को ChatGPT, Sarvam या कोई और AI मत बताओ, और कोई और बनाने वाला या संस्था मत गढ़ो।
- अथर्ववेद में देवी अदिति के बारे में पूछा जाए तो वह अथर्ववेद का विषय है — ग्रंथ-अंश के आधार पर उत्तर दो।
- उत्तर हमेशा केवल ${L(lang).name} में दो, भले ही प्रश्न किसी और भाषा में हो। बोलने लायक 4-7 छोटे वाक्य। कोई markdown, सूची, तारांकन या चिह्न नहीं।
- विषय केवल अथर्ववेद और उसके सूक्त: सूक्त का अर्थ, देवता, ऋषि, काण्ड-सूक्त संख्या, महत्त्व, विनियोग और संदेश।
- यूज़र सिर्फ़ सूक्त का नाम बोले तो उसका अर्थ, देवता, काण्ड-सूक्त संख्या और महत्त्व बताओ।
- स्क्रिप्ट माँगी जाए (ऐप में स्क्रिप्ट अलग से बनती है, फिर भी कभी यहाँ आए) तो उसी भाषा में छोटी वॉइसओवर स्क्रिप्ट दो (आरंभ, सूक्त का भाव, संदेश, समापन) — तब 7 वाक्यों की सीमा लागू नहीं, पर 150 शब्दों के भीतर रखो।
- नमस्ते/धन्यवाद का एक वाक्य में विनम्र उत्तर दो। "तुम कौन हो" या "क्या कर सकती हो" जैसे सवाल अथर्ववेद से बाहर नहीं माने जाते — उनका उत्तर ऊपर वाली पहचान से दो।
- अथर्ववेद से बाहर का सवाल हो तो विनम्रता से कहो कि तुम केवल अथर्ववेद के सूक्तों के बारे में बताती हो, और उत्तर मत दो।
- आधार केवल नीचे दिया "ग्रंथ-अंश" है (अथर्ववेद शौनक संहिता, हिंदी अर्थ सहित)। अर्थ, काण्ड-सूक्त संख्या, सूक्त का नाम, ऋषि, देवता और छन्द वहीं से लो। किसी सूक्त के साथ "दूसरे अनुवाद में अर्थ" भी हो सकता है — दोनों को मिलाकर सबसे स्पष्ट अर्थ बताओ। पाठ OCR से बना है, स्पष्ट छोटी अशुद्धियाँ सही पढ़ लो।
- कोई मंत्र, संख्या या ऋषि का नाम ग्रंथ-अंश में न हो तो उसे गढ़ो मत; साफ़ कहो कि ग्रंथ में यह जानकारी नहीं दी गई। ग्रंथ-अंश में प्रश्न का सूक्त न मिले तो कहो कि पक्का पता नहीं, और काण्ड-सूक्त संख्या या दूसरा नाम पूछो।
- मंत्र उद्धृत करो तो केवल एक छोटा अंश, ठीक वैसा ही जैसा ग्रंथ-अंश में है।

- नीचे "लोगों से सीखी बातें" भी हो सकती हैं — ये जाँची गई हैं पर ग्रंथ जितनी पक्की नहीं। प्रश्न से जुड़ी हों तो उपयोग करो और कहो "लोगों ने मुझे बताया है कि…"; ग्रंथ से टकराएँ तो ग्रंथ को ही मानो।
- कोई बात न ग्रंथ में मिले न सीखी बातों में, तो साफ़ कहो कि पता नहीं, और बताओ कि वे "याद रखो: …" कहकर तुम्हें सिखा सकते हैं।

ग्रंथ-अंश:
${ctx || "(इस प्रश्न से मेल खाता कोई अंश नहीं मिला)"}${learned ? "\n\nलोगों से सीखी बातें:\n" + learned : ""}`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function sarvam(path, init) {
  const r = await fetch(BASE + path, { ...init, headers: { "api-subscription-key": KEY, ...(init.headers || {}) } });
  const body = await r.text();
  if (!r.ok) throw new Error(`Sarvam ${r.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function toHindi(text) {
  try {
    const r = await sarvam("/translate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: text.slice(0, 990), source_language_code: "auto", target_language_code: "hi-IN", model: "mayura:v1" }),
    });
    return r.translated_text || "";
  } catch { return ""; }
}

// ग्रंथ-अंश: सूक्त का नाम, ऋषि, देवता, छन्द + मुख्य पाठ (मंत्र, भावार्थ, टिप्पणी) + दूसरे अनुवाद का अर्थ
function head(r) {
  return `[काण्ड ${r.k}, सूक्त ${r.s}${r.t ? " | नाम: " + r.t : ""} | ऋषि: ${r.r || "—"} | देवता: ${r.d || "—"} | छन्द: ${r.c || "—"}]`;
}
function contextFor(hits, q, big = 3600, small = 1400) {
  return hits.map((r, i) => {
    const max = i === 0 ? big : small;
    let body = excerpt(r.x, q, r.y ? Math.round(max * 0.7) : max);
    if (r.y) body += "\n— दूसरे अनुवाद में अर्थ —\n" + excerpt(r.y, q, Math.round(max * 0.3));
    return head(r) + "\n" + body;
  }).join("\n\n");
}

function chunks(text, max = 450) {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[।॥.!?])\s*/);
  const out = []; let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > max && cur) { out.push(cur); cur = p; } else cur = cur ? cur + " " + p : p;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

export default async (req) => {
  if (!KEY) return json({ error: "SARVAM_API_KEY सेट नहीं है (Netlify → Site settings → Environment variables)।" }, 500);
  const U = new URL(req.url), a = U.searchParams.get("a");
  // पढ़ने के लिए (GET): सूक्तों की सूची और पूरा सूक्त
  if (a === "ping") return json({ ok: true, v: 5, key: !!KEY });
  if (a === "learned") { try { return json((await allFacts(true)).map(({ id, fact, topic, sukta, ts }) => ({ id, fact, topic, sukta, ts }))); } catch (e) { return json({ error: "सीखी बातें नहीं मिलीं: " + e.message }, 502); } }
  if (a === "index") return new Response(JSON.stringify(indexList()), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=86400" } });
  if (a === "sukta") {
    const r = getSukta(+U.searchParams.get("k"), +U.searchParams.get("s"));
    return r ? json({ k: r.k, s: r.s, t: r.t, r: r.r, d: r.d, c: r.c, x: r.x, y: r.y, m: firstMantra(r.x) }) : json({ error: "सूक्त नहीं मिला" }, 404);
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    if (a === "stt") {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || file.size > 2_000_000) return json({ error: "ऑडियो नहीं मिला या बहुत लंबा है (30 सेकंड तक बोलें)।" }, 400);
      const fd = new FormData();
      fd.append("file", new Blob([await file.arrayBuffer()], { type: "audio/wav" }), "speech.wav");
      fd.append("model", "saaras:v3");
      fd.append("mode", "transcribe");
      fd.append("language_code", L(form.get("lang")).code);
      const r = await sarvam("/speech-to-text", { method: "POST", body: fd });
      return json({ text: (r.transcript || "").trim() });
    }
    if (a === "chat") {
      const { messages = [], lang = "hi" } = await req.json();
      const hist = messages.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1500) }));
      const users = hist.filter((m) => m.role === "user").map((m) => m.content);
      const last = users.at(-1) || "";
      // खोज: अभी का प्रश्न + पिछला प्रश्न (ताकि "इसका संदेश क्या है" जैसे सवाल पर भी वही सूक्त मिले)
      let q = last + " " + (users.at(-2) || "");
      if (!/[ऀ-ॿ]/.test(last)) q = (await toHindi(last)) + " " + q;
      let hits = search(q, 3);
      if (!hits.length && users.length > 1) hits = search(users.slice(-3).join(" "), 2);
      let ctx = contextFor(hits, q);
      const facts = await relevantFacts(q).catch(() => []);
      const learned = facts.map((f) => "- " + f.fact + (f.sukta ? " (" + f.sukta + ")" : "")).join("\n");
      const km = q.match(/(\d{1,2}|[०-९]{1,2})\s*(?:वें|वां|वाँ)?\s*(?:कांड|काण्ड)/);
      if (km && !/सूक्त\s*\S*\d/.test(q)) { const k = +km[1].replace(/[०-९]/g, (c) => "०१२३४५६७८९".indexOf(c)); const t = kandaTopics(k); if (t) ctx = `[काण्ड ${k} के सूक्तों के विषय] ${t.slice(0, 2500)}\n\n` + ctx; }
      const r = await sarvam("/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "sarvam-105b-conversations", messages: [{ role: "system", content: system(lang, ctx, learned) }, ...hist], max_tokens: 1400, temperature: 0.3 }),
      });
      const msg = r.choices?.[0]?.message || {};
      const reply = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[*#_`]+/g, "").trim();
      return json({ reply: reply || "माफ़ कीजिए, जवाब पूरा नहीं बन पाया। कृपया दोबारा पूछिए।", mantra: hits[0] ? firstMantra(hits[0].x) : "", title: hits[0] ? hits[0].t : "", refs: hits.map((h) => `${h.k}.${h.s}`) });
    }
    if (a === "tts") {
      // mantra: true → मूल मंत्र, हिंदी भक्तिमय आवाज़ में धीमे; pace: 0.7–1.3
      const { text = "", lang = "hi", pace = 0.95, mantra = false, voice = "", mvoice = "" } = await req.json();
      // आवाज़: ऐप से चुनी हुई (उसी भाषा की bulbul v4 आवाज़), वरना default
      const lc = (L(lang).tts || L(lang).code).slice(0, 2);
      const okV = (v, l) => typeof v === "string" && new RegExp("^[a-z]+_" + l + "_[a-z_]+$").test(v);
      const spk = mantra ? (okV(mvoice, "hi") ? mvoice : "ishita_hi_devotional") : (okV(voice, lc) ? voice : L(lang).voice);
      const p = Math.min(1.3, Math.max(0.7, +pace || 0.95));
      const audios = [];
      for (const part of chunks(String(text).slice(0, 1800))) {
        const r = await sarvam("/text-to-speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: part, language_code: mantra ? "hi-IN" : (L(lang).tts || L(lang).code), model: "bulbul:v4-flash", speaker: spk, pace: mantra ? Math.min(p, 0.85) : p }),
        });
        audios.push(...(r.audios || []));
      }
      return json({ audios });
    }
    if (a === "teach") {
      const { text = "" } = await req.json();
      const t = String(text).trim();
      if (t.length < 8) return json({ ok: false, reason: "कृपया पूरी बात बताइए।" });
      let q = t; if (!/[\u0900-\u097F]/.test(t)) q = (await toHindi(t)) + " " + t;
      const ctx = contextFor(search(q, 2), q, 2500, 800);
      const llm = async (prompt) => {
        const r = await sarvam("/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "sarvam-105b-conversations", max_tokens: 900, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
        return (r.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      };
      try { return json(await teach(q === t ? t : t + "\n(हिंदी: " + q + ")", ctx, llm)); }
      catch (e) { return json({ error: "सीखना अभी नहीं हो सका: " + e.message }, 502); }
    }
    if (a === "forget") {
      const { id = "", pin = "" } = await req.json();
      if (String(pin) !== ADMIN_PIN) return json({ error: "PIN गलत है।" }, 403);
      return json({ ok: await forget(String(id)) });
    }
    if (a === "mantra") {
      // सूक्त का पहला मंत्र: OCR की स्पष्ट अशुद्धियाँ हल्के से ठीक करके (शब्द नहीं बदलते)
      const { k, s: su } = await req.json();
      const r = getSukta(+k, +su); if (!r) return json({ error: "सूक्त नहीं मिला" }, 404);
      const raw = firstMantra(r.x); if (!raw) return json({ error: "मंत्र नहीं मिला" }, 404);
      let fixed = raw;
      try {
        const c = await sarvam("/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "sarvam-105b-conversations", max_tokens: 600, temperature: 0, messages: [
            { role: "system", content: "तुम वैदिक पाठ के प्रूफ़रीडर हो। नीचे अथर्ववेद का एक मंत्र है जो स्कैन से OCR हुआ है। केवल स्पष्ट OCR अशुद्धियाँ (गलत मात्रा, टूटे संयुक्ताक्षर, | की जगह ।, अंक की जगह अक्षर) ठीक करो। कोई शब्द जोड़ो-हटाओ मत, क्रम मत बदलो, अर्थ मत लिखो। स्वर-चिह्न हटा दो। जहाँ पक्का न हो, वैसा ही छोड़ दो। उत्तर में सिर्फ़ सुधरा हुआ मंत्र देवनागरी में दो, और कुछ नहीं।" },
            { role: "user", content: raw }] }) });
        const t = (c.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (t && t.length < raw.length * 1.4 && t.length > raw.length * 0.6 && /[\u0900-\u097F]/.test(t)) fixed = t.split("\n").filter(Boolean).join(" ");
      } catch {}
      return json({ text: fixed, raw, ref: r.k + "." + r.s, title: r.t });
    }
    if (a === "script") {
      // वीडियो-स्क्रिप्ट, ग्रंथ के आधार पर, लिखते-लिखते (stream) भेजी जाती है
      const o = await req.json();
      const S = (v, n = 80) => String(v || "").slice(0, n);
      const name = S(o.name, 120);
      const mins = Math.min(10, Math.max(0.5, +o.dur || 1));
      const words = Math.round(mins * 125), lo = Math.round(words * 0.93), hi = Math.round(words * 1.07);
      const durTxt = mins < 1 ? "30 सेकंड" : mins + " मिनट";
      const extras = (Array.isArray(o.extras) ? o.extras : []).slice(0, 6).map((e) => S(e));
      let q = name;
      if (!/[ऀ-ॿ]/.test(name)) q = (await toHindi(name)) + " " + name;
      const hits = search(q, 2);
      const ctx = contextFor(hits, q, 6500, 1500);
      const prompt = `तुम अथर्ववेद पर YouTube/Instagram कंटेंट के अनुभवी स्क्रिप्ट राइटर हो।
सूक्त: ${name}
भाषा: ${S(o.lang)} | Tone: ${S(o.tone)} | Style: ${S(o.style)}
Episode: ${S(o.ep) || "-"} | Brand: ${S(o.brand)}

सबसे ज़रूरी नियम (लंबाई): वीडियो की अवधि ठीक ${durTxt} है। बोली जाने वाली VOICEOVER SCRIPT में कुल ${lo} से ${hi} शब्द हों (लक्ष्य ${words} शब्द, ~125 शब्द/मिनट)। Script में सिर्फ़ बोले जाने वाले शब्द रखो, [scene] या निर्देश शब्द-गिनती में नहीं गिने जाएँगे।

Output का क्रम:
1. "🎙️ VOICEOVER SCRIPT (${durTxt} · ~${words} शब्द)" — पूरी स्क्रिप्ट, ज़रूरी हो तो समय-अनुसार छोटे हिस्सों (0:00–0:15 आदि) में बाँटकर।
${extras.map((e, i) => `${i + 2}. ${e} — संक्षेप में`).join("\n")}

आधार: नीचे दिया ग्रंथ-अंश (अथर्ववेद शौनक संहिता, हिंदी अर्थ सहित) ही आधार है। स्क्रिप्ट में किसी अनुवादक, लेखक या पुस्तक का नाम मत लिखो। काण्ड-सूक्त संख्या, देवता, मंत्र और अर्थ इसी से लो, कुछ गढ़ो मत। मंत्र ठीक वैसे ही लिखो जैसे ग्रंथ में हैं (OCR की स्पष्ट छोटी अशुद्धि ठीक कर सकते हो)। ग्रंथ-अंश में यह सूक्त न मिले तो पहली पंक्ति में साफ़ लिखो कि ग्रंथ में यह सूक्त नहीं मिला और मंत्र मत लिखो।
अर्थ सटीक और सम्मानजनक हो; कोई झूठा दावा या चमत्कार का वादा नहीं। अंत में ${S(o.brand)} का नाम जोड़ो। Output में अपनी जाँच/गिनती की बातें मत लिखो।

ग्रंथ-अंश:
${ctx || "(कोई मेल खाता सूक्त नहीं मिला)"}`;
      const up = await fetch(BASE + "/v1/chat/completions", {
        method: "POST",
        headers: { "api-subscription-key": KEY, "content-type": "application/json" },
        body: JSON.stringify({ model: "sarvam-105b-conversations", messages: [{ role: "user", content: prompt }], max_tokens: Math.min(8000, words * 5 + 1500), temperature: 0.5, stream: true }),
      });
      if (!up.ok || !up.body) return json({ error: `Sarvam ${up.status}: ${(await up.text()).slice(0, 300)}` }, 502);
      const enc = new TextEncoder(), dec = new TextDecoder();
      const head = hits.length ? `आधार: अथर्ववेद ${hits.map((h) => h.k + "." + h.s).join(", ")}\n\u0000` : "\u0000";
      const stream = new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(enc.encode(head));
          const rd = up.body.getReader(); let buf = "", inThink = false;
          const emit = (t) => {
            let out = "";
            while (t) {
              if (inThink) { const j = t.indexOf("</think>"); if (j < 0) return out && ctrl.enqueue(enc.encode(out)); t = t.slice(j + 8); inThink = false; }
              else { const j = t.indexOf("<think>"); if (j < 0) { out += t; break; } out += t.slice(0, j); t = t.slice(j + 7); inThink = true; }
            }
            if (out) ctrl.enqueue(enc.encode(out));
          };
          try {
            for (;;) {
              const { done, value } = await rd.read(); if (done) break;
              buf += dec.decode(value, { stream: true });
              let k;
              while ((k = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
                if (!line.startsWith("data:")) continue;
                const d = line.slice(5).trim(); if (d === "[DONE]") continue;
                try { const c = JSON.parse(d).choices?.[0]?.delta?.content; if (c) emit(c); } catch {}
              }
            }
          } catch (e) { ctrl.enqueue(enc.encode("\n\n⚠️ " + (e.message || e))); }
          ctrl.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

export const config = { path: "/api/aditi" };
