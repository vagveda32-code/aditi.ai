// अदिति का अपना लॉगिन — कोई भी खाता बनाकर ऐप खोल सकता है।
// खाते Netlify Blobs ("aditi-users") में रहते हैं; पासवर्ड कभी सीधे नहीं रखा जाता (PBKDF2 hash)।
// लॉगिन के बाद एक हस्ताक्षरित टोकन (HMAC) मिलता है — एक बार लॉगिन, फिर उस फ़ोन पर दोबारा नहीं (10 वर्ष)।
// Google से लॉगिन: Netlify में GOOGLE_CLIENT_ID डालने पर "Google से जारी रखें" बटन अपने-आप दिखता है।
import { getStore } from "@netlify/blobs";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const store = () => getStore({ name: "aditi-users", consistency: "strong" });
const DAYS = 3650;
const secret = () => process.env.AUTH_SECRET || createHash("sha256").update("aditi-auth:" + (process.env.SARVAM_API_KEY || "") + ":" + (process.env.ADMIN_PIN || "460860")).digest("hex");

// ईमेल या मोबाइल नंबर — एक ही रूप में
export function normId(x) {
  const s = String(x || "").trim().toLowerCase();
  if (/@/.test(s)) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
  const d = s.replace(/[^\d]/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return d.length >= 10 && d.length <= 15 ? "+" + d : "";
}
const keyOf = (id) => "u_" + createHash("sha256").update(id).digest("hex").slice(0, 32);
const hashPw = (pw, salt) => pbkdf2Sync(String(pw), salt, 120000, 32, "sha256").toString("hex");
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

function token(u) {
  const body = b64(JSON.stringify({ id: u.id, n: u.name, exp: Date.now() + DAYS * 864e5 }));
  return body + "." + sign(body);
}
export function verify(tok) {
  if (!tok || typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const want = sign(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export const userOf = (req) => verify(req.headers.get("x-aditi-token") || "");

export async function signup({ name, id, password }) {
  const nid = normId(id); name = String(name || "").trim().slice(0, 60);
  if (!name) return { error: "name" };
  if (!nid) return { error: "id" };
  if (String(password || "").length < 6) return { error: "short" };
  const st = store(), k = keyOf(nid);
  if (await st.get(k)) return { error: "exists" };
  const salt = randomBytes(16).toString("hex");
  const u = { id: nid, name, salt, hash: hashPw(password, salt), created: Date.now() };
  await st.setJSON(k, u);
  return { token: token(u), name: u.name, id: u.id };
}
export async function login({ id, password }) {
  const nid = normId(id); if (!nid) return { error: "id" };
  const u = await store().get(keyOf(nid), { type: "json" });
  if (!u) return { error: "nouser" };
  if (!u.hash) return { error: "google" };
  const h = hashPw(password, u.salt);
  if (!timingSafeEqual(Buffer.from(h), Buffer.from(u.hash))) return { error: "wrong" };
  return { token: token(u), name: u.name, id: u.id };
}
// प्रबंधक के लिए: सब खाते (नाम, ईमेल/मोबाइल, कब बने) — पासवर्ड-hash नहीं
export async function listUsers() {
  const st = store(); const { blobs } = await st.list({ prefix: "u_" });
  const out = [];
  for (const b of blobs) { const u = await st.get(b.key, { type: "json" }); if (u) out.push({ name: u.name, id: u.id, created: u.created }); }
  return out.sort((a, b) => b.created - a.created);
}

// Google से लॉगिन: Google का दिया ID-token Google से ही जाँचकर खाता बनाओ/खोलो
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || "";
export async function google({ credential }) {
  const gid = googleClientId(); if (!gid) return { error: "nogoogle" };
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(credential || "")));
  if (!r.ok) return { error: "gbad" };
  const t = await r.json();
  if (t.aud !== gid || !(t.email_verified === true || t.email_verified === "true") || !/accounts\.google\.com$/.test(t.iss || "")) return { error: "gbad" };
  const nid = normId(t.email); if (!nid) return { error: "gbad" };
  const st = store(), k = keyOf(nid);
  let u = await st.get(k, { type: "json" });
  if (!u) { u = { id: nid, name: String(t.name || t.email.split("@")[0]).slice(0, 60), google: true, created: Date.now() }; await st.setJSON(k, u); }
  else if (!u.google) { u.google = true; await st.setJSON(k, u); }
  return { token: token(u), name: u.name, id: u.id };
}
