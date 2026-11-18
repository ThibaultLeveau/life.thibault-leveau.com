import { useCallback, useEffect, useRef, useState } from "react";
import { tr as common } from "../../shared/i18n";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import { useApplications } from "../../platform/applications/ApplicationProvider";
import { ProgressionBadge } from "../../platform/progression/ProgressionBadge";
import { useApiResource } from "../../platform/useApiResource";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { Icon } from "../../shared/ui/Icon";
import { recipesApi } from "./api";
import { Empty, LoadState, NameDialog, Pager } from "./components/common";
import { WebImport } from "./components/WebImport";
import { RecipeEditor } from "./components/RecipeEditor";
import { RecipeDetail } from "./components/RecipeDetail";
import { ListDetail } from "./components/ListDetail";
import { dateLabel, tr } from "./i18n";
import type { PageResult, Recipe, ShoppingList } from "./types";
import "./styles.css";

const tabs = [
  ["recipes", "book"],
  ["lists", "cart"],
  ["templates", "copy"],
  ["archives", "archive"],
] as const;
type Tab = (typeof tabs)[number][0];
function readView() {
  const params = new URLSearchParams(location.search);
  return {
    tab: tabs.find(([id]) => id === params.get("tab"))?.[0] ?? "recipes",
    id: params.get("id"),
    edit: params.get("edit") === "1",
    shop: params.get("shop") === "1",
    web:
      params.get("import") === "web" &&
      (!params.get("tab") || params.get("tab") === "recipes") &&
      !params.get("id") &&
      params.get("edit") !== "1",
  };
}

export function Page() {
  const [view, setView] = useState(readView),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [archiveKind, setArchiveKind] = useState<"recipes" | "list" | "template">(
      "recipes",
    ),
    [creating, setCreating] = useState(false),
    [override, setOverride] = useState<Recipe | ShoppingList>(),
    [notice, setNotice] = useState("");
  const dirty = useRef(false),
    busy = useRef(false),
    index = useRef(0),
    restoring = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const onDirty = useCallback((value: boolean) => {
      dirty.current = value;
    }, []),
    onBusy = useCallback((value: boolean) => {
      busy.current = value;
    }, []);
  const draft = { onDirty, onBusy };
  const permit = useCallback(() => {
    if (busy.current) {
      window.alert(tr("busy_leave"));
      return false;
    }
    return !dirty.current || window.confirm(tr("unsaved"));
  }, []);
  const applications = useApplications();
  const tracking = applications.items?.find(
    (a) => a.id === "tracking" && a.enabled,
  );
  const catalogue = useApiResource<PageResult<Recipe | ShoppingList>>(
    async (signal) => {
      if (view.id || view.edit || view.web)
        return { items: [], total: 0, offset: 0, limit: 24 };
      const archived = view.tab === "archives";
      if (view.tab === "recipes" || (archived && archiveKind === "recipes"))
        return recipesApi.recipes(q, archived, offset, signal);
      return recipesApi.lists(
        view.tab === "templates" || (archived && archiveKind === "template")
          ? "template"
          : "list",
        archived,
        q,
        offset,
        signal,
      );
    },
    [view.tab, view.id, view.edit, view.web, archiveKind, q, offset, revision],
  );
  const resource = useApiResource<Recipe | ShoppingList | null>(
    (signal) =>
      !view.id
        ? Promise.resolve(null)
        : view.tab === "recipes"
          ? recipesApi.recipe(view.id, undefined, signal)
          : recipesApi.list(view.id, signal),
    [view.tab, view.id, revision],
  );
  const detail =
    override?.id === view.id &&
    (!resource.data || override.version >= resource.data.version)
      ? override
      : resource.data?.id === view.id
        ? resource.data
        : undefined;
  const title = view.web
    ? tr("web_import")
    : view.edit
      ? tr(view.id ? "edit_recipe" : "new_recipe")
      : view.id && detail
        ? detail.title
        : tr(view.tab);
  useEffect(() => {
    index.current = history.state?.recipesIndex ?? 0;
    history.replaceState({ ...history.state, recipesIndex: index.current }, "");
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const next = event.state?.recipesIndex ?? 0;
      if (!permit()) {
        restoring.current = true;
        history.go(index.current - next || 1);
        return;
      }
      index.current = next;
      dirty.current = false;
      setCreating(false);
      setView(readView());
      setRevision((r) => r + 1);
      setMobile(false);
      setOverride(undefined);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current || busy.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
    };
  }, [permit]);
  useEffect(() => {
    document.title = `${title} · ${tr("app")} · LifeOS`;
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  function go(
    tab: Tab,
    id: string | null = null,
    edit = false,
    shop = false,
    accepted = false,
    web = false,
  ) {
    if (!accepted && !permit()) return;
    dirty.current = false;
    busy.current = false;
    setCreating(false);
    setMobile(false);
    setQ("");
    setOffset(0);
    setNotice("");
    if (view.id !== id || view.tab !== tab) setOverride(undefined);
    const params = new URLSearchParams({ tab });
    if (id) params.set("id", id);
    if (edit) params.set("edit", "1");
    if (shop) params.set("shop", "1");
    if (web) params.set("import", "web");
    index.current++;
    history.pushState({ recipesIndex: index.current }, "", `?${params}`);
    setView({ tab, id, edit, shop, web });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(item: Recipe | ShoppingList, accepted = false) {
    go(
      "servings" in item
        ? "recipes"
        : item.kind === "template"
          ? "templates"
          : "lists",
      item.id,
      false,
      false,
      accepted,
    );
    setOverride(item);
  }
  function changed(list: ShoppingList) {
    setOverride(list);
    setNotice(tr("saved"));
  }
  function create() {
    if (view.tab === "recipes") go("recipes", null, true);
    else if (permit()) setCreating(true);
  }
  const currentIcon = tabs.find(([tab]) => tab === view.tab)![1];
  return (
    <div className="ui-scope recipes-shell">
      <ApplicationSidebar
        name={tr("app")}
        icon="book"
        label={tr("app")}
        mainId="recipes-main"
        open={mobile}
        onOpenChange={setMobile}
        footer={
          <ApplicationFooter
            documentation="recipes"
            beforeSessionChange={permit}
          />
        }
      >
        <nav>
          {tabs.map(([id, icon]) => (
            <button
              key={id}
              className={`application-nav-item ${view.tab === id ? "is-active" : ""}`}
              aria-current={view.tab === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon name={icon} />
              {tr(id)}
            </button>
          ))}
          <a
            className="application-nav-item"
            href="/settings?application=recipes"
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              if (!permit()) event.preventDefault();
              else dirty.current = false;
            }}
          >
            <Icon name="settings" />
            {common("settings")}
          </a>
        </nav>
      </ApplicationSidebar>
      <main id="recipes-main" className="recipes-main" tabIndex={-1}>
        <ApplicationTopbar
          name={tr("app")}
          current={title}
          mainId="recipes-main"
          open={mobile}
          onOpenChange={setMobile}
          status={<ProgressionBadge applicationId="recipes" />}
        />
        <div className="recipes-content">
          {(view.id || view.edit || view.web) && (
            <button className="recipes-back" onClick={() => go(view.tab)}>
              <Icon name="chevron" />
              {tr("back")}
            </button>
          )}
          <header className="recipes-heading">
            <div>
              <p className="eyebrow">{tr("eyebrow")}</p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {!view.id && !view.edit && !view.web && (
                <p className="muted">{tr(`${view.tab}_subtitle`)}</p>
              )}
            </div>
            {!view.id && !view.edit && !view.web && view.tab !== "archives" && (
              <div className="recipes-heading-actions">
                {view.tab === "recipes" && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      go("recipes", null, false, false, false, true)
                    }
                  >
                    <Icon name="sparkles" />
                    {tr("web_import")}
                  </button>
                )}
                <button className="primary-button" onClick={create}>
                  <Icon name="plus" />
                  {tr(
                    view.tab === "recipes"
                      ? "new_recipe"
                      : view.tab === "templates"
                        ? "new_template"
                        : "new_list",
                  )}
                </button>
              </div>
            )}
          </header>
          {notice && (
            <p className="recipes-notice" role="status">
              <Icon name="check" />
              {notice}
            </p>
          )}
          {view.web && (
            <WebImport
              onSaved={(recipe) => open(recipe, true)}
              onCancel={() => go("recipes", null, false, false, true)}
              {...draft}
            />
          )}
          {view.id && <LoadState {...resource} />}
          {view.edit && (!view.id || (detail && "servings" in detail)) && (
            <RecipeEditor
              key={view.id ?? "new"}
              existing={detail && "servings" in detail ? detail : undefined}
              onCancel={() => go("recipes", view.id)}
              onSaved={(r) => open(r, true)}
              {...draft}
            />
          )}
          {view.id &&
            detail &&
            !view.edit &&
            ("servings" in detail ? (
              <RecipeDetail
                key={detail.id}
                recipe={detail}
                onEdit={() => go("recipes", detail.id, true)}
                onChanged={() =>
                  go(
                    detail.archived_at ? "recipes" : "archives",
                    null,
                    false,
                    false,
                    true,
                  )
                }
                onList={(list) => open(list, true)}
                {...draft}
              />
            ) : (
              <ListDetail
                key={`${detail.id}:${view.shop}:${revision}`}
                list={detail}
                shop={
                  view.shop &&
                  !detail.archived_at &&
                  !detail.completed_at &&
                  detail.kind === "list"
                }
                onShop={(shop) => go(view.tab, detail.id, false, shop)}
                onChanged={changed}
                onCopy={(list) => open(list, true)}
                {...draft}
              />
            ))}
          {view.id && !view.edit && (
            <button
              className="recipes-reload"
              onClick={() => {
                if (permit()) {
                  setOverride(undefined);
                  setRevision((r) => r + 1);
                }
              }}
            >
              {tr("refresh")}
            </button>
          )}
          {!view.id && !view.edit && !view.web && (
            <>
              <div className="recipes-toolbar">
                <label className="recipes-search">
                  <Icon name="search" />
                  <span className="sr-only">{tr("search")}</span>
                  <input
                    type="search"
                    maxLength={160}
                    placeholder={tr("search")}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                {view.tab === "archives" && (
                  <label>
                    <span className="sr-only">{tr("archives")}</span>
                    <select
                      value={archiveKind}
                      onChange={(e) => {
                        setArchiveKind(e.target.value as typeof archiveKind);
                        setOffset(0);
                      }}
                    >
                      <option value="recipes">{tr("recipes")}</option>
                      <option value="list">{tr("lists")}</option>
                      <option value="template">{tr("templates")}</option>
                    </select>
                  </label>
                )}
              </div>
              <LoadState {...catalogue} />
              {catalogue.data?.items.length === 0 &&
                !catalogue.loading &&
                (q ? (
                  <p className="recipes-empty-inline">{tr("empty_search")}</p>
                ) : (
                  <Empty icon={currentIcon} title={tr(`empty_${view.tab}`)}>
                    {tr(`empty_${view.tab}_hint`)}
                  </Empty>
                ))}
              <div className="recipes-cards">
                {catalogue.data?.items.map((item) => (
                  <button
                    className="recipes-card"
                    key={item.id}
                    onClick={() => open(item)}
                  >
                    <span className="recipes-card-icon">
                      <Icon
                        name={
                          "servings" in item
                            ? "book"
                            : item.kind === "template"
                              ? "copy"
                              : "cart"
                        }
                        size={24}
                      />
                    </span>
                    <div>
                      <span className="recipes-card-meta">
                        {"servings" in item
                          ? tr("for_people", { count: item.base_servings })
                          : tr(
                              item.completed_at
                                ? "completed"
                                : item.kind === "template"
                                  ? "templates"
                                  : "open",
                            )}
                      </span>
                      <h2>{item.title}</h2>
                      <p>
                        {tr("kind" in item ? "shopping_items" : "items", {
                          count: item.items.length,
                        })}
                        {"servings" in item && item.instructions
                          ? ` · ${item.instructions.slice(0, 85)}`
                          : ""}
                      </p>
                      {!("servings" in item) && (
                        <progress
                          max={Math.max(1, item.items.length)}
                          value={item.items.filter((i) => i.checked).length}
                          aria-label={tr("progress", {
                            done: item.items.filter((i) => i.checked).length,
                            total: item.items.length,
                          })}
                        />
                      )}
                      <small>{dateLabel(item.updated_at)}</small>
                    </div>
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
              {catalogue.data && (
                <Pager {...catalogue.data} onChange={setOffset} />
              )}
              <div className="recipes-quests">
                <Icon name="flag" />
                <div>
                  <p>{tr("quests_hint")}</p>
                  {tracking && (
                    <a
                      href={`${tracking.path}?tab=achievements&application=recipes`}
                    >
                      {tr("quests")}
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {creating && (
          <NameDialog
            title={tr(view.tab === "templates" ? "new_template" : "new_list")}
            onSave={async (name) => {
              const item = await recipesApi.createList(
                name,
                view.tab === "templates" ? "template" : "list",
              );
              open(item, true);
            }}
            onClose={() => setCreating(false)}
            {...draft}
          />
        )}
      </main>
    </div>
  );
}
