/**
 * Worker voor recepten.jal.ink
 *
 * Statische assets (public/) worden vóór dit script geserveerd; alleen
 * niet-asset requests komen hier binnen. Eén endpoint:
 *
 *   POST /api/submit  — inzending van /toevoegen (multipart: pin, text?, photo?)
 *                       → commit naar eran3d/recepten-inbox (queue/<id>/...)
 *                       → Mac-poller (recipe-inbox.py) publiceert binnen ~5 min
 *
 * Secrets (CF dashboard → Settings → Variables and Secrets):
 *   SUBMIT_PIN    — pincode voor het formulier
 *   GITHUB_TOKEN  — fine-grained token, alléén contents:write op recepten-inbox
 */

const INBOX_REPO = "eran3d/recepten-inbox";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_TEXT_CHARS = 20000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSubmit(request, env) {
  if (!env.SUBMIT_PIN || !env.GITHUB_TOKEN) {
    return json(500, { ok: false, error: "Server niet geconfigureerd" });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "Ongeldige inzending" });
  }

  if ((form.get("pin") || "") !== env.SUBMIT_PIN) {
    return json(403, { ok: false, error: "PIN onjuist" });
  }

  const text = (form.get("text") || "").toString().trim();
  const photo = form.get("photo");
  const hasPhoto = photo && typeof photo === "object" && photo.size > 0;

  if (!text && !hasPhoto) {
    return json(400, { ok: false, error: "Voeg een foto of tekst toe" });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return json(400, { ok: false, error: "Tekst te lang" });
  }
  if (hasPhoto && photo.size > MAX_PHOTO_BYTES) {
    return json(400, { ok: false, error: "Foto te groot (max 8 MB)" });
  }

  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  let photoName = null;

  try {
    if (hasPhoto) {
      const ext = extensionFor(photo);
      photoName = `photo.${ext}`;
      const b64 = arrayBufferToBase64(await photo.arrayBuffer());
      await ghPut(env, `queue/${id}/${photoName}`, b64, `Inzending ${id}: foto`);
    }
    // meta.json als laatste — de poller keyt hierop, zo zijn races uitgesloten
    const meta = {
      submitted_at: new Date().toISOString(),
      source: "web",
      text: text || null,
      photo: photoName,
    };
    const metaB64 = arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(meta, null, 2)));
    await ghPut(env, `queue/${id}/meta.json`, metaB64, `Inzending ${id}: meta`);
  } catch (e) {
    return json(502, { ok: false, error: `Opslaan mislukt: ${e.message}` });
  }

  return json(200, { ok: true });
}

function extensionFor(photo) {
  const byType = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic" };
  if (byType[photo.type]) return byType[photo.type];
  const m = /\.([a-z0-9]+)$/i.exec(photo.name || "");
  return m ? m[1].toLowerCase() : "jpg";
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ghPut(env, path, contentB64, message) {
  const res = await fetch(`https://api.github.com/repos/${INBOX_REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "recepten-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: contentB64 }),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}`);
  }
}
