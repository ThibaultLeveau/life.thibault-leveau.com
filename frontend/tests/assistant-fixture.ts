import type { Page } from "@playwright/test";
import type {
  AssistantSettings,
  AssistantSource,
  TranscriptionSettings,
  Conversation,
  Memory,
  Message,
  Snippet,
} from "../src/apps/life_ai/types";

export const now = "2026-11-17T12:00:00Z";
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
export const exampleSnippets: Snippet[] = ids.map((id, i) => ({
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
export async function fixture(page: Page) {
  const session = {
    user_id: "owner-1",
    username: "Camille",
    csrf_token: "csrf-assistant-test",
    expires_at: "2099-01-01T00:00:00Z",
    theme: "light",
    locale: "fr",
  };
  let signedIn = true;
  const disabled = new Set<string>();
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
        [...ids, "life_ai"].map((id, i) => ({
          id,
          name: (session.locale === "en" ? english : names)[i] ?? "Life AI",
          description: "",
          icon: icons[i] ?? "sparkles",
          path: id === "life_ai" ? "/ai" : `/${id}`,
          enabled: !disabled.has(id),
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
    if (
      path === "/assistant/settings" ||
      path === "/assistant/provider-settings"
    ) {
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
    if (
      path === "/assistant/settings/test" ||
      path === "/assistant/provider-settings/test"
    )
      return json({ ok: true });
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
    disabled,
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
