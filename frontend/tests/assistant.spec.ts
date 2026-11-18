import { expect, test, type Page } from "@playwright/test";
import type {
  AssistantSettings,
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
    const body = request.postData() ? request.postDataJSON() : undefined;
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
  await panel.getByLabel("Fournisseur").selectOption("anthropic");
  await expect(panel.locator('input[type="password"]')).toHaveValue("");
  await panel.getByLabel("Fournisseur").selectOption("openai");
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

const tableReply = [
  "Voici les **six brouillons**, prêts à ajouter :",
  "| Tâche | À préparer pour ton IA interne |",
  "|---|---|",
  "| Rédiger mon profil | Les étapes clés de ton parcours et un exemple de ton approche. |",
  "| Renseigner mes expériences pro | Le contexte, tes responsabilités et tes réalisations concrètes. |",
  "| Présenter mes projets pro et perso | L’objectif, ton rôle, tes choix et le résultat. |",
  "| Renseigner mes compétences | Les compétences à mettre en avant avec un exemple concret. |",
  "| Décrire mes offres de service | Les besoins auxquels tu réponds et les livrables proposés. |",
  "| Préparer mes premiers articles de blog | Quelques sujets et notes de départ pour des brouillons. |",
  "",
  "Relis et valide le contenu avant de l’enregistrer.",
].join("\n");

test("tableaux : alignements, échappements, code et contenu malformé sans exécution", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  const literalTable = "| Exemple | Code |\n|---|---|\n| A | B |";
  const unsafe =
    '<img src="https://untrusted.invalid/image" onerror="window.privateLeak=true">';
  data.conversations.get("conversation-1")!.messages[1].content = [
    "Avant le tableau, **du gras** et `du code`.",
    "Nom | Quantité | État",
    ":--- | ---: | :---:",
    "**Profil** | `12` | Prêt",
    "Pro \\| perso | 0 | `a\\|b`",
    "| Incomplet |",
    `| HTML | 1 | ${unsafe} |`,
    "| Lien | 2 | [ouvrir](javascript:alert(1)) ![image](https://untrusted.invalid/image) |",
    "",
    "| Une colonne |",
    "|---|",
    "| Valeur |",
    "",
    "| Mauvais | Séparateur |\n|---|\n| Ne pas | convertir |",
    "",
    "| Valide | Tableau |\n|---|---|\n| Trop | de | cellules conservées |",
    "",
    "```markdown",
    literalTable,
    "```",
    "Après le code.",
    "~~~markdown",
    literalTable,
    // No closing fence: the unfinished example must remain code.
  ].join("\r\n");
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("untrusted.invalid"))
      remoteRequests.push(request.url());
  });
  await page.goto("/?conversation=conversation-1");
  const message = page.locator(".is-assistant .assistant-message-text");
  const tables = message.getByRole("table");
  await expect(tables).toHaveCount(3);
  const first = tables.first();
  await expect(first.getByRole("columnheader")).toHaveText([
    "Nom",
    "Quantité",
    "État",
  ]);
  for (const [index, alignment] of ["left", "right", "center"].entries()) {
    await expect(first.getByRole("columnheader").nth(index)).toHaveCSS(
      "text-align",
      alignment,
    );
    await expect(
      first.locator("tbody tr").first().getByRole("cell").nth(index),
    ).toHaveCSS("text-align", alignment);
  }
  await expect(first.locator("strong")).toHaveText("Profil");
  await expect(first.locator("code")).toHaveText(["12", "a|b"]);
  await expect(
    first.getByRole("cell", { name: "Pro | perso", exact: true }),
  ).toBeVisible();
  await expect(first.locator("tbody tr").nth(2).getByRole("cell")).toHaveText([
    "Incomplet",
    "",
    "",
  ]);
  await expect(
    first.getByRole("cell", { name: unsafe, exact: true }),
  ).toBeAttached();
  await expect(tables.nth(1).getByRole("cell")).toHaveText("Valeur");
  await expect(
    message.locator("p").filter({ hasText: "Mauvais" }),
  ).toContainText("|---|");
  await expect(
    message.locator("p").filter({ hasText: "cellules conservées" }),
  ).toHaveText("| Trop | de | cellules conservées |");
  await expect(message.locator("pre code")).toHaveText([
    literalTable,
    literalTable,
  ]);
  await expect(message.locator("p strong")).toHaveText("du gras");
  await expect(message.locator("p code")).toHaveText("du code");
  await expect(message.locator("img, script, iframe, a")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).privateLeak),
  ).toBeUndefined();
  expect(remoteRequests).toEqual([]);
});

test("tableaux : réponse SSE partielle puis historique rechargé", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  data.conversations.get("conversation-1")!.messages = [];
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith("/messages") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                (window as any).assistantTestStream = controller;
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );
      }
      return original(input, init);
    };
  });
  await page.goto("/?conversation=conversation-1");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Prépare un tableau.");
  await page
    .getByRole("button", { name: "Envoyer le message", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).assistantTestStream))
    .toBe(true);
  async function emit(event: unknown) {
    await page.evaluate((value) => {
      (window as any).assistantTestStream.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`),
      );
    }, event);
  }
  await emit({ type: "delta", text: "| Tâche | Détail |\n|---|" });
  const message = page.locator(".is-assistant .assistant-message-text");
  await expect(message).toContainText("| Tâche | Détail |");
  await expect(message.getByRole("table")).toHaveCount(0);
  await emit({ type: "delta", text: "---|\n| Profil |" });
  await expect(message.getByRole("columnheader")).toHaveText([
    "Tâche",
    "Détail",
  ]);
  await expect(message.getByRole("cell")).toHaveText(["Profil", ""]);
  await emit({ type: "delta", text: " **Parcours** |" });
  await expect(message.locator("td strong")).toHaveText("Parcours");
  const answer: Message = {
    id: "answer-table",
    role: "assistant",
    status: "complete",
    created_at: now,
    content: "| Tâche | Détail |\n|---|---|\n| Profil | **Parcours** |",
    snippets: [],
  };
  data.conversations.get("conversation-1")!.messages = [answer];
  await emit({ type: "message", message: answer });
  await emit({ type: "done" });
  await page.evaluate(() => (window as any).assistantTestStream.close());
  await expect(page.getByLabel("Votre message", { exact: true })).toBeEnabled();
  await page.reload();
  await expect(message.getByRole("cell")).toHaveText(["Profil", "Parcours"]);
});

test("FR/EN, thèmes, 320 px, navigation clavier, snapshots et texte non exécutable", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const data = await fixture(page);
  data.seed();
  data.conversations.get("conversation-1")!.messages[1].content = tableReply;
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
        const table = page.getByRole("table");
        await expect(table.getByRole("columnheader")).toHaveText([
          "Tâche",
          "À préparer pour ton IA interne",
        ]);
        await expect(table.locator("tbody tr")).toHaveCount(6);
        await expect(table.locator("th").first()).toHaveAttribute(
          "scope",
          "col",
        );
        const region = page.getByRole("region", {
          name:
            locale === "fr"
              ? "Tableau du message — défilement horizontal"
              : "Message table — horizontal scrolling",
        });
        if (width === 320) {
          expect(
            await region.evaluate(
              (element) => element.scrollWidth > element.clientWidth,
            ),
          ).toBe(true);
          await page
            .getByRole("button", {
              name:
                locale === "fr"
                  ? "Supprimer la conversation"
                  : "Delete conversation",
              exact: true,
            })
            .focus();
          await page.keyboard.press("Tab");
          await expect(region).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => region.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await region.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
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

test("un aperçu d’import affiche les dix tâches avant confirmation", async ({
  page,
}) => {
  const state = await fixture(page);
  state.seed("import-ten", [
    {
      id: "import-preview",
      application_id: "tasks",
      kind: "import_tasks",
      schema_version: 1,
      phase: "preview",
      operation_id: "operation-import",
      data: {
        title: "Importer des tâches",
        entity: Array.from({ length: 10 }, (_, i) => ({
          id: `preview-${i}`,
          title: `Tâche importée ${i + 1}`,
          description: `Description ${i + 1}`,
        })),
      },
    },
  ]);
  await page.goto("/?conversation=import-ten");
  await expect(
    page.getByText("Tâche importée 10", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".assistant-snippet-line")).toHaveCount(10);
});
