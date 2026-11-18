import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  chromiumSandbox: true,
});
try {
  const page = await browser.newPage();
  await page.goto("chrome://sandbox");
  const text = await page.locator("body").innerText();
  assert.match(text, /PID namespaces\s+Yes/);
  assert.match(text, /Seccomp-BPF sandbox\s+Yes/);
} finally {
  await browser.close();
}
const owner = randomUUID();
const login = "a".repeat(64);
async function call(
  path,
  data,
  {
    status = 200,
    user = owner,
    session = login,
    method = "POST",
    authorized = true,
  } = {},
) {
  const response = await fetch("http://127.0.0.1:8090" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorized
        ? "Bearer " + process.env.LIFE_RECIPE_BROWSER_TOKEN
        : "Bearer invalid",
      "X-Recipe-Owner": user,
      "X-Recipe-Login": session,
    },
    body: method === "DELETE" ? undefined : JSON.stringify(data ?? {}),
  });
  const result = await response.json();
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${response.status}: ${JSON.stringify(result)}`,
  );
  return result;
}
function opening(id = randomUUID(), url = "http://recipe.test") {
  return {
    id,
    url,
    locale: "fr",
    width: 1024,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}
await call("/sessions", opening(), { authorized: false, status: 401 });
const params = opening(),
  frame = await call("/sessions", params, { status: 201 });
assert.match(frame.image, /^[A-Za-z0-9+/]+={0,2}$/);
assert.equal(frame.title, "Lemon pasta source");
const prefix = "/sessions/" + frame.id;
assert.match(
  (await call(prefix + "/source", { document: frame.document })).text,
  /Human check/,
);
await call(prefix + "/frame", {}, { user: randomUUID(), status: 404 });
await call(prefix + "/frame", {}, { session: "b".repeat(64), status: 404 });
await call(
  prefix + "/input",
  { document: frame.document, action: "evaluate", text: "process.env" },
  { status: 422 },
);
await call(
  prefix + "/input",
  { document: frame.document, action: "key", key: "Control+L" },
  { status: 422 },
);
await call(prefix + "/input", {
  document: frame.document,
  action: "click",
  x: 180,
  y: 130,
});
let next;
for (let i = 0; i < 15; i++) {
  next = await call(prefix + "/frame", {}, { status: [200, 409] });
  if (next.document !== undefined && next.document !== frame.document) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
assert.equal(next.title, "Lemon pasta");
await call(prefix + "/source", { document: frame.document }, { status: 409 });
const source = await call(prefix + "/source", { document: next.document });
assert.match(source.text, /Serves 2/);
assert.match(source.text, /Local network denied/);
assert.equal(source.recipes[0].recipeIngredient[0], "1 lemon");
const secondOwner = randomUUID();
const second = await call("/sessions", opening(), {
  user: secondOwner,
  status: 201,
});
await call("/sessions", opening(), { user: randomUUID(), status: 429 });
await call(prefix, undefined, { method: "DELETE" });
await call(prefix + "/frame", {}, { status: 404 });
// Reopening the recipe in a clean context cannot reuse another context's cookie.
const clean = await call(
  "/sessions",
  opening(undefined, "http://recipe.test/recipe"),
  { status: 201 },
);
assert.equal(clean.title, "Lemon pasta source");
await call("/sessions/" + clean.id, undefined, { method: "DELETE" });
for (const url of [
  "http://127.0.0.1",
  "http://169.254.169.254",
  "http://blocked.test",
  "http://recipe.test/redirect",
]) {
  const deniedOwner = randomUUID();
  // A proxy refusal is a rendered HTTP 403 or a failed navigation; neither exposes private content.
  const result = await fetch("http://127.0.0.1:8090/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.LIFE_RECIPE_BROWSER_TOKEN,
      "X-Recipe-Owner": deniedOwner,
      "X-Recipe-Login": login,
    },
    body: JSON.stringify(opening(undefined, url)),
  });
  assert.ok([201, 502].includes(result.status));
  if (result.status === 201) {
    const denied = await result.json();
    const data = await call(
      "/sessions/" + denied.id + "/source",
      { document: denied.document },
      { user: deniedOwner },
    );
    assert.ok(
      !data.text.includes("Lemon pasta") && !data.text.includes("Human check"),
    );
    await call("/sessions/" + denied.id, undefined, {
      method: "DELETE",
      user: deniedOwner,
    });
  }
}
// Without authenticated renewals all contexts disappear, including the second owner.
await new Promise((resolve) => setTimeout(resolve, 22_000));
await call(
  "/sessions/" + second.id + "/frame",
  {},
  { user: secondOwner, status: 404 },
);
console.log(
  "Sandbox, human intervention, same-page capture, cookies, owner/login isolation, stale page, quotas, SSRF and closure verified.",
);
