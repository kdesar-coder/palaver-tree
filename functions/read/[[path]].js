// Runs on Cloudflare for any /read/<slug> address.
// It writes the piece's own title, description, and picture into the page
// so that apps like WhatsApp, X, Facebook, and iMessage show a rich preview.

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "piece";
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function getText(env, request, path) {
  try {
    if (env && env.ASSETS) {
      const r = await env.ASSETS.fetch(new URL(path, request.url));
      if (r && r.ok) return await r.text();
    }
  } catch (e) {}
  try {
    const r = await fetch(new URL(path, request.url));
    if (r && r.ok) return await r.text();
  } catch (e) {}
  return null;
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);

  let slug = params && params.path ? (Array.isArray(params.path) ? params.path[0] : params.path) : "";
  slug = decodeURIComponent(slug || "").replace(/\/+$/, "");

  const html = await getText(env, request, "/index.html");
  if (html == null) {
    return new Response("Not found", { status: 404 });
  }

  let pieces = [];
  const raw = await getText(env, request, "/content/pieces.json");
  if (raw) {
    try { pieces = (JSON.parse(raw).pieces) || []; } catch (e) {}
  }

  const seen = {};
  let piece = null;
  for (const p of pieces) {
    let base = slugify(p.title), s = base, n = 2;
    while (seen[s]) { s = base + "-" + n; n++; }
    seen[s] = true;
    if (s === slug) { piece = p; piece.__slug = s; }
  }

  const baseResponse = new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
  if (!piece) return baseResponse;

  const title = piece.title + " \u00b7 The Palaver Tree";
  const desc = String(piece.body || "").replace(/\s+/g, " ").trim().slice(0, 155);
  const pageUrl = url.origin + "/read/" + piece.__slug;

  let img = piece.image || "";
  if (img && typeof img === "object") img = img.path || img.src || "";
  if (img && !/^https?:\/\//.test(img)) img = url.origin + (img.charAt(0) === "/" ? img : "/" + String(img).replace(/^\.?\//, ""));

  const cardType = img ? "summary_large_image" : "summary";

  let rw = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute("content", desc); } })
    .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", pageUrl); } })
    .on('meta[property="og:type"]', { element(e) { e.setAttribute("content", "article"); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", desc); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", pageUrl); } })
    .on('meta[name="twitter:card"]', { element(e) { e.setAttribute("content", cardType); } })
    .on('meta[name="twitter:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element(e) { e.setAttribute("content", desc); } });

  if (img) {
    const safeImg = esc(img);
    rw = rw.on("head", { element(e) {
      e.append('<meta property="og:image" content="' + safeImg + '">', { html: true });
      e.append('<meta name="twitter:image" content="' + safeImg + '">', { html: true });
    }});
  }

  return rw.transform(baseResponse);
}
