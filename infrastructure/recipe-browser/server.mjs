/** Private, short-lived browser sessions. Only the authenticated LifeOS API calls this service. */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { chromium } from "playwright-core";

const token = process.env.LIFE_RECIPE_BROWSER_TOKEN || "";
if (token.length < 32) throw new Error("A browser service token is required");
const proxy = process.env.LIFE_RECIPE_PROXY || "http://recipe-egress:3128";
const proxyHost = new URL(proxy).hostname;
const sessions = new Map();
let activeBrowsers = 0;
const openings = [];
const MAX_SESSIONS = 2;
const IDLE_MS = 10 * 60_000;
const ABSOLUTE_MS = 30 * 60_000;
const LEASE_MS = 20_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KEYS = new Set([
  "Enter",
  "Tab",
  "Shift+Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
]);

class Failure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
const fail = (status, code) => {
  throw new Failure(status, code);
};
function authorize(req) {
  const incoming = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from("Bearer " + token);
  if (
    incoming.length !== expected.length ||
    !timingSafeEqual(incoming, expected)
  )
    fail(401, "unauthorized");
  const owner = req.headers["x-recipe-owner"],
    login = req.headers["x-recipe-login"];
  if (!UUID.test(owner || "") || !/^[a-f0-9]{64}$/.test(login || ""))
    fail(401, "unauthorized");
  return { owner, login };
}
export function publicUrl(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\x00-\x20\x7f\\]/.test(value)
  )
    fail(422, "invalid_url");
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(422, "invalid_url");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    fail(422, "invalid_url");
  return url.href;
}
function fields(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    fail(422, "invalid_command");
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) fail(413, "request_too_large");
    chunks.push(chunk);
  }
  try {
    return size ? JSON.parse(Buffer.concat(chunks)) : {};
  } catch {
    fail(422, "invalid_command");
  }
}
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function releaseSlot(session) {
  if (!session.released) {
    session.released = true;
    activeBrowsers--;
  }
}
async function close(session) {
  if (session.closed) return;
  session.closed = true;
  sessions.delete(session.id);
  try {
    await session.browser?.close();
  } catch {
    /* already disconnected */
  }
  if (!session.launching) releaseSlot(session);
}
function getSession(id, auth) {
  const session = sessions.get(id);
  if (
    !session ||
    session.owner !== auth.owner ||
    session.login !== auth.login ||
    session.closed
  )
    fail(404, "session_expired");
  if (
    Date.now() >
    Math.min(session.lease, session.expires, session.lastAction + IDLE_MS)
  ) {
    void close(session);
    fail(404, "session_expired");
  }
  session.lease = Math.min(Date.now() + LEASE_MS, session.expires);
  return session;
}
async function exclusive(session, action) {
  if (session.pending >= 3) fail(429, "busy");
  session.pending++;
  const previous = session.queue;
  let release;
  session.queue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  let deadline;
  try {
    if (session.closed) fail(404, "session_expired");
    return await Promise.race([
      action(),
      new Promise((_, reject) => {
        deadline = setTimeout(() => {
          void close(session);
          reject(new Failure(502, "page_unavailable"));
        }, 15_000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
    session.pending--;
    release();
  }
}
async function metadata(session, withFrame = true) {
  const document = session.document;
  const url = session.page.url();
  const title = (await session.page.title()).slice(0, 300);
  const image = withFrame
    ? (
        await session.page.screenshot({
          type: "jpeg",
          quality: 75,
          timeout: 8000,
        })
      ).toString("base64")
    : null;
  if (document !== session.document) fail(409, "page_changed");
  return {
    id: session.id,
    url,
    title,
    document,
    width: session.width,
    height: session.height,
    image,
    expires_at: new Date(
      Math.min(session.expires, session.lastAction + IDLE_MS),
    ).toISOString(),
  };
}
async function open(auth, body) {
  fields(body, ["id", "url", "locale", "width", "expires_at"]);
  if (!UUID.test(body.id || "") || !["fr", "en"].includes(body.locale))
    fail(422, "invalid_command");
  const url = publicUrl(body.url);
  const width = body.width;
  if (!Number.isInteger(width) || width < 320 || width > 1280)
    fail(422, "invalid_command");
  const expires = Math.min(
    Date.parse(body.expires_at),
    Date.now() + ABSOLUTE_MS,
  );
  if (!Number.isFinite(expires) || expires <= Date.now())
    fail(401, "unauthorized");
  const existing = sessions.get(body.id);
  if (existing) {
    if (
      existing.owner !== auth.owner ||
      existing.login !== auth.login ||
      existing.initialUrl !== url
    )
      fail(409, "session_conflict");
    await existing.ready;
    return exclusive(getSession(existing.id, auth), () => metadata(existing));
  }
  while (openings.length && openings[0].time < Date.now() - 60_000)
    openings.shift();
  if (
    openings.filter((item) => item.owner === auth.owner).length >= 5 ||
    openings.length >= 20
  )
    fail(429, "busy");
  for (const old of sessions.values())
    if (old.owner === auth.owner) await close(old);
  if (activeBrowsers >= MAX_SESSIONS) fail(429, "capacity");
  const now = Date.now();
  openings.push({ owner: auth.owner, time: now });
  activeBrowsers++;
  const session = {
    ...auth,
    id: body.id,
    initialUrl: url,
    width,
    height: 720,
    expires,
    lease: now + 60_000,
    lastAction: now,
    document: 0,
    closed: false,
    launching: true,
    released: false,
    pending: 0,
    queue: Promise.resolve(),
    browser: null,
    page: null,
  };
  sessions.set(session.id, session); // reserve before awaiting browser launch
  session.ready = (async () => {
    try {
      session.browser = await chromium.launch({
        headless: false,
        chromiumSandbox: true,
        timeout: 20_000,
        proxy: { server: proxy, bypass: "<-loopback>" },
        env: {
          PATH: process.env.PATH,
          DISPLAY: process.env.DISPLAY,
          XAUTHORITY: process.env.XAUTHORITY,
          LANG: "C.UTF-8",
          XDG_CONFIG_HOME: "/tmp/config",
          XDG_CACHE_HOME: "/tmp/cache",
        },
        args: [
          "--disable-quic",
          "--disable-gpu",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE " + proxyHost,
        ],
      });
      if (session.closed) {
        await session.browser.close();
        fail(404, "session_expired");
      }
      const context = await session.browser.newContext({
        locale: body.locale,
        viewport: { width, height: session.height },
        acceptDownloads: false,
        serviceWorkers: "block",
        permissions: [],
      });
      await context.route("**/*", async (route) => {
        try {
          publicUrl(route.request().url());
          await route.continue();
        } catch {
          await route.abort().catch(() => {});
        }
      });
      session.page = await context.newPage();
      session.page.setDefaultTimeout(8000);
      session.page.on("framenavigated", (frame) => {
        if (frame === session.page.mainFrame()) session.document++;
      });
      session.page.on(
        "dialog",
        (dialog) => void dialog.dismiss().catch(() => {}),
      );
      session.page.on(
        "download",
        (download) => void download.cancel().catch(() => {}),
      );
      context.on("page", (page) => {
        if (page !== session.page) void page.close().catch(() => {});
      });
      await session.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 25_000,
      });
      publicUrl(session.page.url());
    } catch (error) {
      await close(session);
      if (error instanceof Failure) throw error;
      fail(502, "page_unavailable");
    } finally {
      session.launching = false;
      if (session.closed) releaseSlot(session);
    }
  })();
  await session.ready;
  session.lease = Math.min(Date.now() + LEASE_MS, session.expires);
  return exclusive(session, () => metadata(session));
}
function position(body, session) {
  if (
    ![body.x, body.y].every(Number.isFinite) ||
    body.x < 0 ||
    body.y < 0 ||
    body.x > session.width ||
    body.y > session.height
  )
    fail(422, "invalid_command");
}
async function interact(session, body) {
  fields(body, ["action", "x", "y", "dx", "dy", "key", "text", "document"]);
  if (body.document !== session.document) fail(409, "page_changed");
  const page = session.page;
  switch (body.action) {
    case "click":
      position(body, session);
      await page.mouse.click(body.x, body.y);
      break;
    case "move":
      position(body, session);
      await page.mouse.move(body.x, body.y);
      break;
    case "down":
      position(body, session);
      await page.mouse.move(body.x, body.y);
      await page.mouse.down();
      break;
    case "up":
      position(body, session);
      await page.mouse.move(body.x, body.y);
      await page.mouse.up();
      break;
    case "scroll":
      if (
        ![body.dx, body.dy].every(
          (n) => Number.isFinite(n) && Math.abs(n) <= 1500,
        )
      )
        fail(422, "invalid_command");
      await page.mouse.wheel(body.dx, body.dy);
      break;
    case "key":
      if (!KEYS.has(body.key)) fail(422, "invalid_command");
      await page.keyboard.press(body.key);
      break;
    case "text":
      if (
        typeof body.text !== "string" ||
        !body.text.length ||
        body.text.length > 2000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.text)
      )
        fail(422, "invalid_command");
      await page.keyboard.insertText(body.text);
      break;
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 });
      break;
    case "reload":
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      break;
    default:
      fail(422, "invalid_command");
  }
  session.lastAction = Date.now();
  return { ok: true };
}
async function source(session, body) {
  fields(body, ["document"]);
  if (body.document !== session.document) fail(409, "page_changed");
  const before = session.document;
  const url = publicUrl(session.page.url());
  const extracted = await session.page.evaluate(() => {
    // Bound JSON parsing and tree traversal before returning any website data.
    const recipes = [];
    let visited = 0,
      total = 0,
      truncated = false;
    function walk(value, depth = 0) {
      if (
        ++visited > 5000 ||
        depth > 20 ||
        recipes.length >= 10 ||
        !value ||
        typeof value !== "object"
      )
        return;
      if ([value["@type"]].flat().includes("Recipe")) {
        const encoded = JSON.stringify(value);
        if (total + encoded.length <= 60_000) {
          recipes.push(value);
          total += encoded.length;
        } else truncated = true;
        return;
      }
      for (const item of Object.values(value))
        if (Array.isArray(item))
          for (const entry of item) walk(entry, depth + 1);
        else walk(item, depth + 1);
    }
    for (const node of [
      ...document.querySelectorAll('script[type="application/ld+json"]'),
    ].slice(0, 20)) {
      if (node.textContent.length > 200_000) {
        truncated = true;
        continue;
      }
      try {
        walk(JSON.parse(node.textContent));
      } catch {
        /* invalid metadata is ignored */
      }
    }
    const text =
      (
        document.querySelector("main") ||
        document.querySelector("article") ||
        document.body
      )?.innerText || "";
    return {
      title: document.title.slice(0, 300),
      text: text.slice(0, 60_000),
      recipes,
      truncated: truncated || text.length > 60_000,
    };
  });
  if (before !== session.document || url !== session.page.url())
    fail(409, "page_changed");
  session.lastAction = Date.now();
  return { url, ...extracted };
}

const timer = setInterval(() => {
  for (const session of sessions.values())
    if (
      Date.now() >
      Math.min(session.lease, session.expires, session.lastAction + IDLE_MS)
    )
      void close(session);
}, 1000).unref();
const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      send(res, 200, { ok: true });
      return;
    }
    const auth = authorize(req);
    const body = await readBody(req);
    if (req.method === "POST" && req.url === "/sessions") {
      send(res, 201, await open(auth, body));
      return;
    }
    const match = /^\/sessions\/([a-f0-9-]+)(?:\/(frame|input|source))?$/.exec(
      req.url || "",
    );
    if (!match || !UUID.test(match[1])) fail(404, "not_found");
    const session = getSession(match[1], auth);
    await session.ready;
    if (req.method === "DELETE" && !match[2]) {
      await close(session);
      send(res, 200, { ok: true });
      return;
    }
    if (req.method !== "POST") fail(405, "method_not_allowed");
    const value = await exclusive(session, async () => {
      if (match[2] === "frame") {
        fields(body, []);
        return metadata(session);
      }
      if (match[2] === "input") return interact(session, body);
      if (match[2] === "source") return source(session, body);
      fail(404, "not_found");
    });
    send(res, 200, value);
  } catch (error) {
    // No website URLs, contents, authentication headers or provider secrets in logs.
    send(res, error instanceof Failure ? error.status : 502, {
      code: error instanceof Failure ? error.message : "page_unavailable",
    });
  }
});
server.requestTimeout = 35_000;
server.headersTimeout = 10_000;
server.maxConnections = 32;
server.listen(8090, "0.0.0.0");
async function shutdown() {
  clearInterval(timer);
  server.close();
  await Promise.all([...sessions.values()].map(close));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
