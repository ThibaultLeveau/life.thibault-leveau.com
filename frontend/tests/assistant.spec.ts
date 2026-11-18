import { expect, test, type Page } from "@playwright/test";
import type {
  AssistantSettings,
  AssistantSource,
  TranscriptionSettings,
  Conversation,
  Memory,
  Message,
  Snippet,
} from "../src/platform/assistant/types";

const now = "2026-11-17T12:00:00Z";
const ids = ["tasks", "sport", "tracking", "okr", "recipes"];
const names = [
  "Tâches",
  "Sport",
  "Suivi",
  "Objectifs OKR",
  "Recettes & Liste de courses",
];
const english = [
  "Tasks",
  "Sport",
  "Tracking",
  "OKR Goals",
  "Recipes & Shopping lists",
];
const icons = ["check", "dumbbell", "activity", "flag", "cart"];
const exampleSnippets: Snippet[] = ids.map((id, i) => ({
  id: `snippet-${id}`,
  application_id: id,
  kind: `${id}__create`,
  schema_version: 1,
  phase: i === 0 ? "preview" : "result",
  ...(i === 0 ? { operation_id: "operation-1" } : {}),
  data: {
    title: [
      "Préparer la présentation",
      "Séance du matin",
      "Un moment pour soi",
      "Lancer le projet",
      "Les courses de la semaine",
    ][i],
    ...(i === 0
      ? {
          arguments: {
            payload: {
              title: "Préparer la présentation",
              due_date: "2026-11-18",
            },
          },
        }
      : {
          entity: [
            null,
            {
              name: "Mobilité & énergie",
              entries: [
                { name: "Squat", sets: 3 },
                { name: "Rowing", sets: 4 },
              ],
            },
            {
              definition: { name: "Mon énergie" },
              period_start: "2026-11-17",
              score: 8.5,
            },
            {
              title: "Lancer le projet",
              progress: 45,
              key_results: [
                { title: "Premiers clients", current: 4, target: 10, unit: "" },
              ],
            },
            {
              title: "Dîners de la semaine",
              items: [
                { name: "Tomates", quantity: "500", unit: "g" },
                { name: "Riz", quantity: "250", unit: "g", checked: true },
              ],
            },
          ][i],
        }),
  },
}));

/** Browser contract fixture. Real owner/transaction/provider behavior is covered by backend and container tests. */
async function fixture(page: Page) {
  const session = {
    user_id: "owner-1",
    username: "Camille",
    csrf_token: "csrf-assistant-test",
    expires_at: "2099-01-01T00:00:00Z",
    theme: "light",
    locale: "fr",
  };
  let signedIn = true;
  let settings: AssistantSettings = {
    provider: "openai",
    model: "test-model",
    configured: true,
    token_hint: "••••1234",
    memory_enabled: true,
  };
  let memories: Memory[] = [
    {
      id: "memory-1",
      content: "Je travaille sur le projet Atlas.",
      category: "projects",
      source_conversation_id: "conversation-1",
      created_at: now,
      updated_at: now,
    },
  ];
  const conversations = new Map<
    string,
    { conversation: Conversation; messages: Message[] }
  >();
  const sources = new Map<string, AssistantSource>();
  let transcriptionSettings: TranscriptionSettings = {
    provider: "openai",
    model: "gpt-transcribe",
    configured: true,
    token_hint: null,
    use_chat_provider: true,
    custom_provider: null,
    custom_model: "",
    custom_configured: false,
    custom_token_hint: null,
  };
  const requests: { path: string; method: string; body: any; csrf?: string }[] =
    [];
  let count = 0;
  function seed(id = "conversation-1", snippets = exampleSnippets) {
    const conversation: Conversation = {
      id,
      title: "Une journée bien organisée",
      archived: false,
      created_at: now,
      updated_at: now,
    };
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        content: "Aide-moi à préparer ma semaine.",
        status: "complete",
        snippets: [],
        created_at: now,
      },
      {
        id: "answer-1",
        role: "assistant",
        content:
          "Voici une proposition, à votre rythme.\n\n**Un prochain pas concret** pour chaque projet, et de la place pour vous.",
        status: "complete",
        snippets,
        created_at: now,
      },
    ];
    conversations.set(id, { conversation, messages });
    return conversation;
  }
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const body = request.postData()
      ? request.headers()["content-type"]?.includes("application/json")
        ? request.postDataJSON()
        : request.postDataBuffer()
      : undefined;
    requests.push({
      path,
      method,
      body,
      csrf: request.headers()["x-csrf-token"],
    });
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, json: value });
    if (path === "/auth/session") {
      if (method === "DELETE") {
        signedIn = false;
        return route.fulfill({ status: 204 });
      }
      return signedIn ? json(session) : json({ detail: "Expired" }, 401);
    }
    if (!signedIn) return json({ detail: "Expired" }, 401);
    if (path === "/preferences") {
      Object.assign(session, body ?? {});
      return json({ theme: session.theme, locale: session.locale });
    }
    if (path === "/applications")
      return json(
        ids.map((id, i) => ({
          id,
          name: (session.locale === "en" ? english : names)[i],
          description: "",
          icon: icons[i],
          path: `/${id}`,
          enabled: true,
          updated_at: now,
        })),
      );
    if (path === "/progression/settings")
      return json({
        timezone: "Europe/Paris",
        vacations: [],
        usage_days: {},
        exclude_weekends: {},
        version: 1,
      });
    if (path === "/assistant/sources/limits")
      return json({
        max_sources: 4,
        max_file_bytes: 10485760,
        max_image_bytes: 5242880,
        max_total_bytes: 20971520,
        max_pdf_pages: 50,
        accepted_extensions: [
          ".pdf",
          ".txt",
          ".md",
          ".png",
          ".jpg",
          ".jpeg",
          ".webp",
          ".docx",
          ".csv",
        ],
        accepted_media_types: [],
      });
    if (
      path === "/assistant/sources/files" ||
      path === "/assistant/sources/web"
    ) {
      const source: AssistantSource = {
        id: `source-${sources.size + 1}`,
        kind: path.endsWith("/web") ? "web" : "file",
        name: url.searchParams.get("filename") || "Article de test",
        media_type: request.headers()["content-type"] || "text/html",
        size_bytes: body?.length || 100,
        sha256: "synthetic",
        url: body?.url ?? null,
        created_at: now,
        removed_at: null,
        page_count: null,
      };
      sources.set(source.id, source);
      return json(source, 201);
    }
    if (/^\/assistant\/sources\/[^/]+$/.test(path)) {
      const source = sources.get(path.split("/").at(-1)!);
      if (!source) return json({ detail: "Missing" }, 404);
      if (method === "DELETE") {
        source.removed_at = now;
        return route.fulfill({ status: 204 });
      }
      return json(source);
    }
    if (path === "/assistant/transcription/settings") {
      if (method === "PUT") {
        transcriptionSettings.use_chat_provider = body.use_chat_provider;
        if (body.provider)
          transcriptionSettings.custom_provider = body.provider;
        if (body.model !== undefined)
          transcriptionSettings.custom_model = body.model;
        if (body.api_token !== undefined)
          transcriptionSettings.custom_configured = body.api_token !== null;
      }
      const useChat = transcriptionSettings.use_chat_provider;
      return json({
        ...transcriptionSettings,
        provider: useChat
          ? settings.provider
          : transcriptionSettings.custom_provider,
        model: useChat ? "gpt-transcribe" : transcriptionSettings.custom_model,
        configured: useChat
          ? settings.configured && settings.provider !== "anthropic"
          : transcriptionSettings.custom_configured,
      });
    }
    if (path === "/assistant/transcription")
      return json({ text: "Un texte dicté." });
    if (path === "/assistant/settings") {
      if (method === "PUT") {
        settings = {
          ...settings,
          ...body,
          configured:
            body.api_token === null
              ? false
              : body.api_token
                ? true
                : settings.configured,
        };
        delete (settings as any).api_token;
      }
      return json(settings);
    }
    if (path === "/assistant/settings/test") return json({ ok: true });
    if (path === "/assistant/memories") {
      if (method === "DELETE") {
        memories = [];
        return route.fulfill({ status: 204 });
      }
      if (method === "POST") {
        const memory = {
          id: `memory-${Date.now()}`,
          category: "personal",
          content: body.content,
          created_at: now,
          updated_at: now,
        };
        memories.push(memory);
        return json(memory);
      }
      return json({ items: memories, total: memories.length });
    }
    if (path.startsWith("/assistant/memories/")) {
      const id = path.split("/").at(-1);
      if (method === "DELETE") {
        memories = memories.filter((item) => item.id !== id);
        return route.fulfill({ status: 204 });
      }
      const memory = memories.find((item) => item.id === id)!;
      Object.assign(memory, body);
      return json(memory);
    }
    if (path === "/assistant/conversations") {
      if (method === "POST") {
        const conversation = seed(`new-${++count}`, []);
        conversations.get(conversation.id)!.messages = [];
        return json(conversation, 201);
      }
      const items = [...conversations.values()]
        .map((value) => value.conversation)
        .filter(
          (value) =>
            value.archived === (url.searchParams.get("archived") === "true") &&
            value.title.includes(url.searchParams.get("q") ?? ""),
        );
      return json({ items, total: items.length });
    }
    const match = path.match(
      /^\/assistant\/conversations\/([^/]+)(\/messages)?$/,
    );
    if (match) {
      const data = conversations.get(match[1]);
      if (!data) return json({ detail: "Missing" }, 404);
      if (match[2]) {
        const answer: Message = {
          id: `reply-${count}`,
          role: "assistant",
          content: "Votre semaine prend forme. Voici les changements proposés.",
          status: "complete",
          snippets: exampleSnippets,
          created_at: now,
        };
        data.messages.push(
          {
            id: `question-${count}`,
            role: "user",
            content: body.content,
            sources: (body.source_ids ?? []).map((id: string) =>
              sources.get(id),
            ),
            status: "complete",
            snippets: [],
            created_at: now,
          },
          answer,
        );
        const events = [
          { type: "status", text: "Consultation de Tâches", run_id: "run-1" },
          { type: "delta", text: "Votre semaine " },
          {
            type: "message",
            message: {
              ...answer,
              status: "running",
              content: "Votre semaine ",
            },
          },
          { type: "delta", text: "prend forme." },
          { type: "message", message: answer },
          { type: "done" },
        ];
        return route.fulfill({
          contentType: "text/event-stream",
          body: events
            .map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`)
            .join(""),
        });
      }
      if (method === "PATCH") {
        Object.assign(data.conversation, body);
        return json(data.conversation);
      }
      if (method === "DELETE") {
        conversations.delete(match[1]);
        return route.fulfill({ status: 204 });
      }
      return json({ ...data, has_more: false });
    }
    if (path === "/assistant/operations/operation-1/confirm") {
      const snippet: Snippet = {
        ...exampleSnippets[0],
        phase: "result",
        data: {
          title: "Tâche enregistrée",
          entity: { title: "Préparer la présentation", due_date: "2026-11-18" },
        },
      };
      conversations.forEach((data) =>
        data.messages.forEach((message) => {
          message.snippets = message.snippets.map((item) =>
            item.id === snippet.id ? snippet : item,
          );
        }),
      );
      return json({
        operation_id: "operation-1",
        status: "completed",
        result: {},
        snippet,
      });
    }
    if (/\/assistant\/runs\/[^/]+\/cancel/.test(path))
      return json({ ok: true });
    return json({ detail: `Unmocked ${method} ${path}` }, 404);
  });
  return {
    session,
    sources,
    requests,
    seed,
    conversations,
    setConfigured: (value: boolean) => {
      settings.configured = value;
    },
    setSettings: (value: Partial<AssistantSettings>) => {
      Object.assign(settings, value);
    },
  };
}

test("chat : contrat SSE, cinq snippets, confirmation, historique et actions", async ({
  page,
}) => {
  const data = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Aide-moi à préparer ma semaine.");
  await page
    .getByRole("button", { name: "Envoyer le message", exact: true })
    .click();
  await expect(page).toHaveURL(/conversation=new-1/);
  await expect(
    page.getByText(
      "Votre semaine prend forme. Voici les changements proposés.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".assistant-snippet")).toHaveCount(3);
  await page.locator(".assistant-snippets-more").click();
  await expect(page.locator(".assistant-snippet")).toHaveCount(5);
  await expect(page.getByText("Mobilité & énergie")).toBeVisible();
  await expect(page.getByText("Mon énergie", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Premiers clients", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tomates", { exact: true })).toBeVisible();
  const message = data.requests.find((request) =>
    request.path.endsWith("/messages"),
  )!;
  expect(message.csrf).toBe("csrf-assistant-test");
  expect(message.body.content).toBe("Aide-moi à préparer ma semaine.");
  expect(message.body.request_id).toMatch(/^[\da-f-]{36}$/);
  await page.getByRole("button", { name: "Confirmer ce changement" }).click();
  await expect(
    page.getByText("Tâche enregistrée", { exact: true }),
  ).toBeVisible();
  expect(
    data.requests.filter((request) => request.path.endsWith("/confirm")),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".assistant-snippet")).toHaveCount(3);
  await page.locator(".assistant-snippets-more").click();
  await expect(page.locator(".assistant-snippet")).toHaveCount(5);
  await page.getByRole("button", { name: "Renommer la conversation" }).click();
  await page.getByLabel("Titre de la conversation").fill("Mon projet Atlas");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(page.locator(".application-breadcrumb")).toContainText(
    "Mon projet Atlas",
  );
  await page
    .getByRole("button", { name: "Archiver la conversation", exact: true })
    .click();
  await expect(
    page.getByLabel("Votre message", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Restaurer la conversation", exact: true })
    .click();
  await expect(page.getByLabel("Votre message", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "Supprimer la conversation", exact: true })
    .click();
  await page
    .getByLabel("Oublier également les souvenirs issus de cette conversation")
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Supprimer la conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  expect(data.conversations.size).toBe(0);
  await expect(page.locator(".assistant-welcome h1")).toBeVisible();
  await expect(page.locator(".assistant-message")).toHaveCount(0);
  await expect(page.locator(".assistant-history-item")).toHaveCount(0);
  await expect(
    page.getByLabel("Votre message", { exact: true }),
  ).toHaveValue("");
  await expect(page).toHaveTitle("Assistant · LifeOS");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Une nouvelle demande.");
  await page
    .getByRole("button", { name: "Envoyer le message", exact: true })
    .click();
  await expect(page).toHaveURL(/conversation=new-2/);
  await expect(
    page.getByText("Une nouvelle demande.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aide-moi à préparer ma semaine.", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const locale of ["fr", "en"] as const) {
  test(`suppression ${locale} : annulation, échec puis retour à l’accueil sans brouillon`, async ({
    page,
  }) => {
    const data = await fixture(page);
    data.session.locale = locale;
    data.seed("conversation-1", []);
    if (locale === "en")
      await page.setViewportSize({ width: 320, height: 800 });
    const labels =
      locale === "fr"
        ? {
            remove: "Supprimer la conversation",
            cancel: "Annuler",
            message: "Votre message",
          }
        : {
            remove: "Delete conversation",
            cancel: "Cancel",
            message: "Your message",
          };
    await page.goto("/?conversation=conversation-1");
    const composer = page.getByLabel(labels.message, { exact: true });
    await composer.fill("Un brouillon dans la conversation supprimée");
    const remove = page.getByRole("button", {
      name: labels.remove,
      exact: true,
    });
    const dialog = page.getByRole("dialog");
    await remove.click();
    await dialog
      .getByRole("button", { name: labels.cancel, exact: true })
      .click();
    await expect(page).toHaveURL(/conversation=conversation-1/);
    await expect(page.locator(".assistant-message")).toHaveCount(2);
    expect(
      data.requests.filter((request) => request.method === "DELETE"),
    ).toHaveLength(0);

    let fail = true;
    await page.route(
      "**/api/v1/assistant/conversations/conversation-1?**",
      async (route) => {
        if (route.request().method() === "DELETE" && fail)
          return route.fulfill({
            status: 503,
            json: { detail: "Suppression indisponible" },
          });
        return route.fallback();
      },
    );
    await remove.click();
    await dialog
      .getByRole("button", { name: labels.remove, exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/conversation=conversation-1/);
    await expect(page.locator(".assistant-message")).toHaveCount(2);
    await expect(composer).toHaveValue(
      "Un brouillon dans la conversation supprimée",
    );
    expect(data.conversations.has("conversation-1")).toBe(true);

    fail = false;
    await dialog
      .getByRole("button", { name: labels.remove, exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".assistant-welcome h1")).toBeVisible();
    await expect(page.locator(".assistant-message")).toHaveCount(0);
    await expect(composer).toHaveValue("");
    await expect(composer).toBeEnabled();
    expect(data.conversations.size).toBe(0);
    await page.reload();
    await expect(page.locator(".assistant-welcome h1")).toBeVisible();
    await expect(page.locator(".assistant-message")).toHaveCount(0);
  });
}

test("aperçu d'archivage : cible réelle, reçu conservé si la synchronisation échoue", async ({
  page,
}) => {
  const data = await fixture(page);
  const target = {
    id: "task-archive",
    title: "Préparer le bilan annuel",
    archived_at: null as string | null,
  };
  const preview: Snippet = {
    id: "archive-preview",
    application_id: "tasks",
    kind: "archive_task",
    schema_version: 1,
    phase: "preview",
    operation_id: "archive-operation",
    data: {
      title: "Archive a task",
      labels: { fr: "Archiver une tâche", en: "Archive a task" },
      arguments: { task_id: target.id, expected_version: 3 },
      entity: { ...target, archived_at: now },
      effect: "archive",
      targets: [target.title],
    },
  };
  data.seed("conversation-1", [preview]);
  let confirmations = 0;
  let failSync = true;
  let releaseSync: (() => void) | undefined;
  await page.route("**/api/v1/preferences", async (route) => {
    if (!failSync) return route.fallback();
    await new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    await route.fulfill({ status: 503, json: { detail: "Unavailable" } });
  });
  await page.route(
    "**/api/v1/assistant/operations/archive-operation/confirm",
    async (route) => {
      confirmations++;
      target.archived_at = now;
      const snippet: Snippet = {
        ...preview,
        phase: "result",
        data: {
          ...(preview.data as object),
          entity: null,
          targets: [target.title],
        },
      };
      data.conversations.get("conversation-1")!.messages[1].snippets = [
        snippet,
      ];
      await route.fulfill({
        json: {
          operation_id: "archive-operation",
          status: "completed",
          result: null,
          snippet,
        },
      });
    },
  );
  await page.goto("/?conversation=conversation-1");
  const card = page.locator(".assistant-snippet");
  await expect(
    card.getByRole("heading", { name: "Archiver une tâche" }),
  ).toBeVisible();
  await expect(card.getByText(target.title, { exact: true })).toBeVisible();
  await expect(
    card.getByText("Action : archiver", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(`Éléments concernés : ${target.title}`, { exact: true }),
  ).toBeVisible();
  expect(target.archived_at).toBeNull();
  await card.getByRole("button", { name: "Confirmer ce changement" }).click();
  await expect(card.getByText("Résultat", { exact: true })).toBeVisible();
  await expect(card.getByText(target.title, { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Votre message", { exact: true }),
  ).toBeDisabled();
  await expect.poll(() => !!releaseSync).toBe(true);
  releaseSync!();
  await expect(
    card.getByText(
      "Le changement est enregistré. Vos préférences n’ont pas pu être actualisées dans cette page.",
    ),
  ).toBeVisible();
  expect(target.archived_at).toBe(now);
  expect(confirmations).toBe(1);
  await expect(
    card.getByRole("button", { name: "Confirmer ce changement" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Votre message", { exact: true })).toBeEnabled();
  failSync = false;
  await card
    .getByRole("button", { name: "Actualiser mes préférences" })
    .click();
  await expect(
    card.getByRole("button", { name: "Actualiser mes préférences" }),
  ).toHaveCount(0);
  expect(confirmations).toBe(1);
  data.session.locale = "en";
  await page.reload();
  await expect(
    card.getByRole("heading", { name: "Archive a task" }),
  ).toBeVisible();
  await expect(card.getByText(target.title, { exact: true })).toBeVisible();
});

test("navigation mobile : recherche et conversations restent dans le parcours clavier", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  const menu = page.getByRole("button", {
    name: "Ouvrir la navigation",
    exact: true,
  });
  await menu.click();
  await expect(page.locator(".application-nav-close")).toBeFocused();
  for (let step = 0; step < 5; step++) await page.keyboard.press("Tab");
  const search = page.getByLabel("Rechercher une conversation", {
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill("Une journée");
  const conversation = page
    .locator(".assistant-history-item")
    .filter({ hasText: "Une journée bien organisée" });
  await expect(conversation).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(conversation).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/conversation=conversation-1/);
  await expect(page.locator(".application-sidebar")).not.toHaveAttribute(
    "role",
    "dialog",
  );
  await expect(menu).toBeFocused();
});

test("la mémoire se désactive avant toute configuration de modèle ou de clé", async ({
  page,
}) => {
  const data = await fixture(page);
  data.setSettings({ configured: false, model: "", token_hint: null });
  await page.goto("/settings");
  const panel = page.locator("#assistant-settings");
  await expect(panel.getByLabel("Modèle", { exact: true })).toHaveValue("");
  await panel
    .getByRole("checkbox", { name: "Mémoriser les informations utiles" })
    .uncheck();
  await panel.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    panel.getByText("Réglages enregistrés.", { exact: true }),
  ).toBeVisible();
  const write = data.requests.find(
    (request) =>
      request.path === "/assistant/settings" && request.method === "PUT",
  )!;
  expect(write.body.memory_enabled).toBe(false);
  expect(write.body).not.toHaveProperty("model");
  expect(write.body).not.toHaveProperty("api_token");
});

test("réglages : secret à écriture seule, brouillons et mémoire modifiable", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/settings");
  const panel = page.locator("#assistant-settings");
  await panel
    .getByLabel("Nouvelle clé API", { exact: true })
    .fill("a-key-for-the-previous-provider");
  await panel.getByLabel(/^Fournisseur/).selectOption("anthropic");
  await expect(panel.locator('input[type="password"]')).toHaveValue("");
  await panel.getByLabel(/^Fournisseur/).selectOption("openai");
  await panel.getByLabel("Modèle", { exact: true }).fill("test-model");
  await panel
    .getByLabel("Nouvelle clé API", { exact: true })
    .fill("synthetic-provider-secret-only");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Sections des réglages" })
    .getByRole("link", { name: "Tâches", exact: true })
    .click();
  await expect(
    panel.getByLabel("Nouvelle clé API", { exact: true }),
  ).toHaveValue("synthetic-provider-secret-only");
  await panel.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    panel.getByLabel("Nouvelle clé API", { exact: true }),
  ).toHaveValue("");
  expect(
    data.requests.find(
      (request) =>
        request.path === "/assistant/settings" && request.method === "PUT",
    )?.body.api_token,
  ).toBe("synthetic-provider-secret-only");
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("synthetic-provider");
  await panel.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(panel.getByText("Connexion réussie.")).toBeVisible();
  const memory = page.locator("#assistant-memory");
  await memory.getByRole("button", { name: "Modifier le souvenir" }).click();
  await memory
    .getByLabel("Information à mémoriser")
    .fill("Je travaille maintenant sur le projet Orion.");
  await memory
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    memory.getByText("Je travaille maintenant sur le projet Orion."),
  ).toBeVisible();
  await memory.getByRole("button", { name: "Oublier ce souvenir" }).click();
  await expect(
    memory.getByText("Rien de mémorisé pour le moment."),
  ).toBeVisible();
  await memory.getByRole("button", { name: "Ajouter un souvenir" }).click();
  await memory
    .getByLabel("Information à mémoriser")
    .fill("Je préfère les matinées calmes.");
  await memory
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await memory.getByRole("button", { name: "Tout oublier" }).click();
  await expect(
    memory.getByText("Rien de mémorisé pour le moment."),
  ).toBeVisible();
});

test("FR/EN, thèmes, 320 px, navigation clavier, snapshots et texte non exécutable", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const data = await fixture(page);
  data.seed();
  for (const locale of ["fr", "en"])
    for (const theme of ["light", "dark", "system"])
      for (const width of [320, 1440]) {
        data.session.locale = locale;
        data.session.theme = theme;
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".assistant-welcome h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (theme !== "system")
          await page.screenshot({
            animations: "disabled",
            path: info.outputPath(
              `assistant-home-${locale}-${theme}-${width}.png`,
            ),
          });
        if (width === 320) {
          const menu = page.getByRole("button", {
            name: locale === "fr" ? "Ouvrir la navigation" : "Open navigation",
            exact: true,
          });
          await menu.click();
          await expect(page.locator(".application-sidebar")).toHaveAttribute(
            "role",
            "dialog",
          );
          await expect(page.locator(".application-nav-close")).toBeFocused();
          expect(
            await page
              .locator("#assistant-main")
              .evaluate((element) => (element as HTMLElement).inert),
          ).toBe(true);
          await page.keyboard.press("Escape");
          await expect(menu).toBeFocused();
        }
        await page.goto("/?conversation=conversation-1");
        await expect(page.locator(".assistant-snippet")).toHaveCount(3);
        await page.locator(".assistant-snippets-more").click();
        await expect(page.locator(".assistant-snippet")).toHaveCount(5);
        await expect(
          page.getByText("Mon énergie", { exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.locator(".assistant-scroll").evaluate((element) => {
          element.scrollTop = 0;
        });
        if (theme !== "system")
          await page.screenshot({
            animations: "disabled",
            path: info.outputPath(
              `assistant-chat-${locale}-${theme}-${width}.png`,
            ),
          });
      }
  data.conversations.get("conversation-1")!.messages[1].content =
    '<img src=x onerror="window.privateLeak=true"> **Un texte sûr**';
  await page.reload();
  await expect(page.locator(".assistant-message-text strong")).toHaveText(
    "Un texte sûr",
  );
  expect(
    await page.evaluate(() => (window as any).privateLeak),
  ).toBeUndefined();
  await expect(page.locator(".assistant-message-text img")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".assistant-message").first()).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("configuration absente et expiration démontent les données privées", async ({
  page,
}) => {
  const data = await fixture(page);
  data.setConfigured(false);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Configurer mon assistant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toHaveCount(0);
  data.setConfigured(true);
  data.seed();
  await page.goto("/?conversation=conversation-1");
  await expect(page.locator(".assistant-snippet")).toHaveCount(3);
  await page.locator(".assistant-snippets-more").click();
  await expect(page.locator(".assistant-snippet")).toHaveCount(5);
  await page.route(
    "**/api/v1/assistant/conversations/conversation-1/messages",
    (route) =>
      route.fulfill({ status: 401, json: { detail: "Session expired" } }),
  );
  await page.getByLabel("Votre message", { exact: true }).fill("Bonjour");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".assistant-messages")).toHaveCount(0);
});

test("aperçu LifeOS : protection du brouillon puis synchronisation de langue et thème", async ({
  page,
}) => {
  const data = await fixture(page);
  const common: Snippet = {
    id: "common-preview",
    application_id: "lifeos",
    kind: "save_preferences",
    schema_version: 1,
    phase: "preview",
    operation_id: "common-operation",
    data: {
      title: "Langue et thème",
      arguments: { payload: { locale: "en", theme: "dark" } },
    },
  };
  data.seed("conversation-1", [common]);
  let confirmed = 0;
  await page.route(
    "**/api/v1/assistant/operations/common-operation/confirm",
    async (route) => {
      confirmed++;
      data.session.locale = "en";
      data.session.theme = "dark";
      const snippet: Snippet = {
        ...common,
        phase: "result",
        data: {
          title: "Preferences saved",
          entity: { locale: "en", theme: "dark" },
        },
      };
      data.conversations.get("conversation-1")!.messages[1].snippets = [
        snippet,
      ];
      await route.fulfill({
        json: {
          operation_id: "common-operation",
          status: "completed",
          result: { locale: "en", theme: "dark" },
          snippet,
        },
      });
    },
  );
  await page.goto("/?conversation=conversation-1");
  await expect(page.locator(".assistant-snippet")).toContainText("English");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Un brouillon à préserver");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Confirmer ce changement" }).click();
  expect(confirmed).toBe(0);
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveValue(
    "Un brouillon à préserver",
  );
  await page.getByLabel("Votre message", { exact: true }).fill("");
  await page.getByRole("button", { name: "Confirmer ce changement" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".assistant-snippet")).toContainText(
    "Preferences saved",
  );
  expect(confirmed).toBe(1);
});

test("un refus de création ou d'admission conserve le brouillon sans nouvel envoi", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.route("**/api/v1/assistant/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { detail: "Unavailable" } });
  });
  await page.goto("/");
  const composer = page.getByLabel("Votre message", { exact: true });
  await composer.fill("Un message à conserver après création refusée");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(composer).toHaveValue(
    "Un message à conserver après création refusée",
  );
  await expect(composer).toBeEnabled();
  expect(
    data.requests.filter((request) => request.path.endsWith("/messages")),
  ).toHaveLength(0);
  data.seed("conversation-1", []);
  await page.goto("/?conversation=conversation-1");
  let attempted = 0;
  await page.route(
    "**/api/v1/assistant/conversations/conversation-1/messages",
    async (route) => {
      attempted++;
      await route.fulfill({
        status: 422,
        json: { detail: "Le message a été refusé." },
      });
    },
  );
  await composer.fill("Un message à conserver après admission refusée");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(composer).toHaveValue(
    "Un message à conserver après admission refusée",
  );
  await expect(composer).toBeEnabled();
  await expect(page.getByText("Le message a été refusé.")).toBeVisible();
  expect(attempted).toBe(1);
});

test("une coupure réseau après admission récupère le résultat sans rejouer le message", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  let attempted = 0;
  await page.route(
    "**/api/v1/assistant/conversations/conversation-1/messages",
    async (route) => {
      attempted++;
      data.conversations.get("conversation-1")!.messages[1].content =
        "Le changement a bien été enregistré.";
      await route.abort("failed");
    },
  );
  await page.goto("/?conversation=conversation-1");
  const composer = page.getByLabel("Votre message", { exact: true });
  await composer.fill("Une demande dont la réponse réseau sera perdue");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByText("Le changement a bien été enregistré.", { exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(composer).toBeEnabled();
  await page.reload();
  await expect(
    page.getByText("Le changement a bien été enregistré.", { exact: true }),
  ).toBeVisible();
  expect(attempted).toBe(1);
});

test("une réponse en cours est récupérée après rechargement sans répéter le message", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  const response = data.conversations.get("conversation-1")!.messages[1];
  response.content = "Première partie reçue.";
  response.status = "running";
  response.run_id = "running-recovery";
  await page.goto("/?conversation=conversation-1");
  await expect(
    page.getByText("Réponse en cours. Synchronisation avec le serveur…"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Arrêter la réponse" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Votre message", { exact: true }),
  ).toBeDisabled();
  response.content = "Le résultat enregistré a été récupéré.";
  response.status = "complete";
  await expect(
    page.getByText("Le résultat enregistré a été récupéré.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Votre message", { exact: true })).toBeEnabled();
  expect(
    data.requests.filter(
      (request) =>
        request.path.endsWith("/messages") && request.method === "POST",
    ),
  ).toHaveLength(0);
});

test("sources : fichier et page web sans texte, historique, retrait et CSRF", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Une note à lire"),
  });
  await expect(page.getByLabel("Retirer la source notes.txt")).toBeVisible();
  await expect(page.getByText("Préparation en cours…")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ajouter une page web", exact: true })
    .click();
  await page
    .getByLabel("Adresse de la page web")
    .fill("https://example.com/article");
  await page.getByRole("button", { name: "Lire la page", exact: true }).click();
  await expect(
    page.getByLabel("Retirer la source https://example.com/article"),
  ).toBeVisible();
  const send = page.getByRole("button", { name: "Envoyer le message" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByLabel("Télécharger notes.txt")).toBeVisible();
  const write = data.requests.find((request) =>
    request.path.endsWith("/messages"),
  )!;
  expect(write.body.content).toBe("");
  expect(write.body.source_ids).toHaveLength(2);
  expect(
    data.requests
      .filter((request) => request.method === "POST")
      .every((request) => request.csrf === "csrf-assistant-test"),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Télécharger notes.txt")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Supprimer le contenu de notes.txt").click();
  await expect(
    page.getByText("Contenu supprimé", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Télécharger notes.txt")).toHaveCount(0);
});

test("sources : limites, brouillon protégé, refus d’admission et nouvelle tentative", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  await page.goto("/?conversation=conversation-1");
  await page.locator('input[type="file"]').setInputFiles({
    name: "script.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("rejected"),
  });
  await expect(
    page.getByText("Ce format de fichier n’est pas accepté."),
  ).toBeVisible();
  expect(data.sources.size).toBe(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Une note"),
  });
  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Nouvelle conversation", exact: true })
    .click();
  await expect(page.getByLabel("Retirer la source note.txt")).toBeVisible();
  let attempts = 0;
  await page.route(
    "**/api/v1/assistant/conversations/conversation-1/messages",
    async (route) => {
      attempts++;
      await route.fulfill({
        status: 422,
        json: { detail: "Admission refusée" },
      });
    },
  );
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByText("Admission refusée")).toBeVisible();
  await expect(page.getByLabel("Retirer la source note.txt")).toBeVisible();
  expect(attempts).toBe(1);
  await page.unroute(
    "**/api/v1/assistant/conversations/conversation-1/messages",
  );
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByLabel("Télécharger note.txt")).toBeVisible();
  expect(
    data.requests.filter(
      (request) => request.path === "/assistant/sources/files",
    ),
  ).toHaveLength(1);
});

test("sources : annulation d’une préparation tardive et réessai après erreur", async ({
  page,
}) => {
  await fixture(page);
  let release: () => void = () => {};
  let preparing = false;
  await page.route("**/api/v1/assistant/sources/files?**", async (route) => {
    preparing = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ status: 503, json: { detail: "Unavailable" } })
      .catch(() => {});
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "late.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Late"),
  });
  await expect.poll(() => preparing).toBe(true);
  await page.getByLabel("Retirer la source late.txt").click();
  release();
  await expect(page.getByText("late.txt", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/assistant/sources/files?**");
  let failed = true;
  await page.route("**/api/v1/assistant/sources/files?**", async (route) => {
    if (failed) {
      failed = false;
      return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
    }
    return route.fallback();
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Retry"),
  });
  await page.getByLabel("Réessayer la source retry.txt").click();
  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
});

async function fakeRecorder(
  page: Page,
  mode: "ready" | "denied" | "pending" = "ready",
) {
  await page.addInitScript((mode) => {
    const state = window as any;
    state.stoppedTracks = 0;
    const stream = {
      getTracks: () => [
        {
          stop: () => {
            state.stoppedTracks++;
          },
        },
      ],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          mode === "denied"
            ? Promise.reject(new DOMException("Denied", "NotAllowedError"))
            : mode === "pending"
              ? new Promise((resolve) => {
                  state.resolveMicrophone = () => resolve(stream);
                })
              : Promise.resolve(stream),
      },
    });
    class Recorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }
      state = "inactive";
      mimeType = "audio/mp4";
      ondataavailable: any;
      onstop: any;
      onerror: any;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob(["recorded audio"], { type: this.mimeType }),
          });
          this.onstop?.();
        });
      }
    }
    state.MediaRecorder = Recorder;
  }, mode);
}

test("dictée : format négocié, texte existant préservé, envoi manuel et pistes arrêtées", async ({
  page,
}) => {
  const data = await fixture(page);
  await fakeRecorder(page);
  await page.goto("/");
  const composer = page.getByLabel("Votre message", { exact: true });
  await composer.fill("Mon brouillon");
  await page.getByLabel("Dicter un texte", { exact: true }).click();
  await expect(page.getByText(/Dictée en cours/)).toBeVisible();
  await composer.fill("Mon brouillon complété");
  await page.getByRole("button", { name: "Terminer la dictée" }).click();
  await expect(composer).toHaveValue("Mon brouillon complété Un texte dicté.");
  expect(
    data.requests.filter((request) => request.path.endsWith("/messages")),
  ).toHaveLength(0);
  expect(
    data.requests.find((request) => request.path === "/assistant/transcription")
      ?.csrf,
  ).toBe("csrf-assistant-test");
  expect(await page.evaluate(() => (window as any).stoppedTracks)).toBe(1);
  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
});

test("dictée : permission refusée, annulation de permission tardive et transcription obsolète", async ({
  page,
}) => {
  await fixture(page);
  await fakeRecorder(page, "pending");
  await page.goto("/");
  await page.getByLabel("Dicter un texte", { exact: true }).click();
  await expect(
    page.getByText("Autorisez le microphone dans votre navigateur."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.evaluate(() => (window as any).resolveMicrophone());
  await expect
    .poll(() => page.evaluate(() => (window as any).stoppedTracks))
    .toBe(1);
  await expect(page.getByText(/Dictée en cours/)).toHaveCount(0);
  await fakeRecorder(page, "denied");
  await page.reload();
  await page.getByLabel("Dicter un texte", { exact: true }).click();
  await expect(
    page.getByText(/L’accès au microphone a été refusé/),
  ).toBeVisible();
  await fakeRecorder(page);
  await page.reload();
  let release: () => void = () => {};
  await page.route("**/api/v1/assistant/transcription?**", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: { text: "Réponse tardive" } }).catch(() => {});
  });
  await page.getByLabel("Dicter un texte", { exact: true }).click();
  await page.getByRole("button", { name: "Terminer la dictée" }).click();
  await expect(page.getByText("Transcription en cours…")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  release();
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveValue(
    "",
  );
});

test("réglages dictée : fournisseur distinct, secret à écriture seule et brouillon protégé", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/settings");
  await page
    .getByRole("checkbox", {
      name: "Utiliser le fournisseur et la clé de la conversation",
    })
    .uncheck();
  await page
    .getByLabel("Clé API de dictée", { exact: true })
    .fill("synthetic-dictation-secret");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Sections des réglages" })
    .getByRole("link", { name: "Tâches", exact: true })
    .click();
  await expect(
    page.getByLabel("Clé API de dictée", { exact: true }),
  ).toHaveValue("synthetic-dictation-secret");
  await page
    .getByRole("button", { name: "Enregistrer la dictée", exact: true })
    .click();
  await expect(
    page.getByLabel("Clé API de dictée", { exact: true }),
  ).toHaveValue("");
  expect(
    data.requests.find(
      (request) =>
        request.path === "/assistant/transcription/settings" &&
        request.method === "PUT",
    )?.body.api_token,
  ).toBe("synthetic-dictation-secret");
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("synthetic-dictation-secret");
});

test("sources : quatre pièces maximum, image trop grande et cartes accessibles à 320 px", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      name: `note-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("Note"),
    })),
  );
  await expect(
    page.getByText("Vous pouvez joindre au maximum 4 sources par message."),
  ).toBeVisible();
  await expect(page.locator(".assistant-source")).toHaveCount(4);
  await expect.poll(() => data.sources.size).toBe(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const remove = page.getByLabel("Retirer la source note-0.txt");
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText(
      "Ce fichier dépasse la taille autorisée, ou le total des sources est trop volumineux.",
    ),
  ).toBeVisible();
  expect(data.sources.size).toBe(4);
});

test("dictée : arrêt automatique à deux minutes et réessai sans réenregistrer", async ({
  page,
}) => {
  await fixture(page);
  await fakeRecorder(page);
  await page.clock.install();
  let attempts = 0;
  await page.route("**/api/v1/assistant/transcription?**", async (route) => {
    attempts++;
    expect(new URL(route.request().url()).searchParams.get("filename")).toBe(
      "dictation.m4a",
    );
    if (attempts === 1)
      return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
    return route.fulfill({ json: { text: "Transcription récupérée." } });
  });
  await page.goto("/");
  await page.getByLabel("Dicter un texte", { exact: true }).click();
  await expect(page.getByText(/Dictée en cours/)).toBeVisible();
  await page.clock.runFor(120_001);
  await page
    .getByRole("button", { name: "Réessayer la transcription" })
    .click();
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveValue(
    "Transcription récupérée.",
  );
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => (window as any).stoppedTracks)).toBe(1);
});

test("réglages dictée : la configuration indépendante survit à la réutilisation du chat", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/settings");
  const reuse = page.getByRole("checkbox", {
    name: "Utiliser le fournisseur et la clé de la conversation",
  });
  await reuse.uncheck();
  await page.getByLabel(/^Fournisseur de dictée/).selectOption("gemini");
  await page
    .getByLabel("Modèle de dictée", { exact: true })
    .fill("gemini-transcription-test");
  await page
    .getByLabel("Clé API de dictée", { exact: true })
    .fill("synthetic-independent-gemini-key");
  const save = page.getByRole("button", {
    name: "Enregistrer la dictée",
    exact: true,
  });
  await save.click();
  await expect(save).toBeDisabled();
  await reuse.check();
  await save.click();
  await expect(save).toBeDisabled();
  await page.reload();
  await reuse.uncheck();
  await expect(page.getByLabel(/^Fournisseur de dictée/)).toHaveValue("gemini");
  await expect(
    page.getByLabel("Modèle de dictée", { exact: true }),
  ).toHaveValue("gemini-transcription-test");
  await expect(
    page.getByLabel("Clé API de dictée", { exact: true }),
  ).toHaveValue("");
  await save.click();
  await expect(save).toBeDisabled();
  const writes = data.requests.filter(
    (request) =>
      request.path === "/assistant/transcription/settings" &&
      request.method === "PUT",
  );
  expect(writes).toHaveLength(3);
  expect(writes[2].body).toEqual({
    provider: "gemini",
    model: "gemini-transcription-test",
    use_chat_provider: false,
  });
});

test("sources : les lots attendent les deux créneaux d’import et les sources en attente s’annulent", async ({
  page,
}) => {
  await fixture(page);
  let active = 0,
    maximum = 0,
    admitted = 0;
  const releases: (() => void)[] = [];
  await page.route("**/api/v1/assistant/sources/files?**", async (route) => {
    active++;
    admitted++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    await route.fallback();
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 4 }, (_, index) => ({
      name: `queued-${index}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("Source"),
    })),
  );
  await expect.poll(() => admitted).toBe(2);
  await expect(page.locator(".assistant-source")).toHaveCount(4);
  await page.getByLabel("Retirer la source queued-3.txt").click();
  releases.shift()!();
  await expect.poll(() => admitted).toBe(3);
  expect(maximum).toBe(2);
  while (releases.length) releases.shift()!();
  await expect(
    page.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
  expect(admitted).toBe(3);
  await expect(page.getByLabel("Retirer la source queued-3.txt")).toHaveCount(
    0,
  );
});

test("sources : le retour navigateur conserve une URL refusée et efface son abandon accepté", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  await page.goto("/?conversation=conversation-1");
  await expect(page.getByLabel("Votre message", { exact: true })).toBeEnabled();
  await page
    .getByRole("button", { name: "Nouvelle conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("button", { name: "Ajouter une page web", exact: true })
    .click();
  const input = page.getByLabel("Adresse de la page web");
  await input.fill("https://example.com/private-draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/$/);
  await expect(input).toHaveValue("https://example.com/private-draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/conversation=conversation-1/);
  await expect(input).toHaveCount(0);
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Ajouter une page web", exact: true })
    .click();
  await expect(input).toHaveValue("");
  expect(
    data.requests.filter(
      (request) => request.path === "/assistant/sources/web",
    ),
  ).toHaveLength(0);
});
