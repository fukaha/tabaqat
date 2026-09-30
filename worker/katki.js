// Okur önerisi aktarıcısı (Cloudflare Worker).
// Sitedeki "Katkı / düzeltme" formu GitHub hesabı olmayan okurlar için buraya gönderir; bu betik öneriyi
// denetleyip depoda "katki" etiketli bir konu (issue) açar. Yönetici paneli (#/yonetim) bu konuları listeler.
// Gizli değişken: GITHUB_TOKEN — yalnız fukaha/tabaqat için, yalnız "Issues: Read and write" izinli jeton.
const REPO = "fukaha/tabaqat";
const ORIGINS = ["https://fukaha.github.io"];
const RELS = { fiqh: "tefakkuh", took: "ahz", hadith: "semâ/rivayet", read: "kıraat", companion: "sohbet" };
const ID = /^[a-z]{1,4}\d{1,6}$/;
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return out(405, { error: "method" });
    if (!ORIGINS.includes(origin)) return out(403, { error: "origin" });
    if (+(req.headers.get("Content-Length") || 0) > 8000) return out(413, { error: "size" });
    let o; try { o = await req.json(); } catch { return out(400, { error: "json" }); }
    if (o.web) return out(200, { ok: true });   // bal küpü alanı doldurulmuş: sessizce yok say
    const x = { op: str(o.op, 5), t: str(o.t, 12), s: str(o.s, 12), rel: str(o.rel, 12), p: str(o.p, 12),
      src: str(o.src, 300), q: str(o.q, 1200), note: str(o.note, 1500), by: str(o.by, 80),
      tr: str(o.tr, 200), trs: str(o.trs, 120), ar: str(o.ar, 300), d: str(o.d, 4) };
    const bad = !["add", "del", "note", "fix"].includes(x.op)
      || (x.op === "note" ? !x.note || (x.p && !ID.test(x.p))
        : x.op === "fix" ? !ID.test(x.p) || !x.src || !(x.tr || x.trs || x.ar || x.d) || (x.d && !/^\d{1,4}$/.test(x.d))
        : !ID.test(x.t) || !ID.test(x.s) || x.t === x.s)
      || (x.op === "add" && (!RELS[x.rel] || !x.src));
    if (bad) return out(400, { error: "fields" });
    for (const k in x) if (!x[k]) delete x[k];
    const pg = x.op === "note" || x.op === "fix" ? x.p : x.s;
    const title = x.op === "add" ? `[katkı] ${x.t} → ${x.s} (hoca–talebe)` : x.op === "del" ? `[katkı] Hatalı bağ: ${x.t} → ${x.s}`
      : x.op === "fix" ? `[katkı] Ad / vefat: ${x.p}` : `[katkı] Düzeltme: ${x.p || "genel"}`;
    const L = [x.op === "add" ? `**Önerilen bağ:** ${x.t} → ${x.s} (${RELS[x.rel]})` : x.op === "del" ? `**Hatalı olduğu bildirilen bağ:** ${x.t} → ${x.s}`
      : x.op === "fix" ? `**Ad / vefat düzeltmesi:** ${[x.tr && `tam ad: ${x.tr}`, x.trs && `kısa ad: ${x.trs}`, x.ar && `Arapça ad: ${x.ar}`, x.d && `vefat: ${x.d}`].filter(Boolean).join("; ")}`
      : "**Düzeltme bildirimi**"];
    if (pg) L.push(`Sayfa: https://fukaha.github.io/tabaqat/#/p/${pg}`);
    if (x.src) L.push(`**Kaynak:** ${x.src}`);
    if (x.q) L.push(`**Kanıt metni:**\n> ${x.q}`);
    if (x.note) L.push(`**Açıklama:** ${x.note}`);
    if (x.by) L.push(`**Gönderen:** ${x.by}`);
    L.push("", "_Sitedeki öneri formundan gönderildi._", `<!-- katki\n${JSON.stringify(x).replace(/--/g, "- -")}\n-->`);
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, { method: "POST",
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "tabaqat-katki",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: L.join("\n\n"), labels: ["katki"] }) });
    return r.ok ? out(200, { ok: true }) : out(502, { error: "github", status: r.status });
  },
};
