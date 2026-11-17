"""Build independent bilingual guide navigation/search with the existing MkDocs site.

URLs and source files stay stable. Only the page's rendering context is scoped;
MkDocs still validates links and builds all pages in one strict invocation.
"""

import json
import posixpath
import re
from pathlib import Path

from mkdocs.exceptions import PluginError
from mkdocs.plugins import event_priority
from mkdocs.structure.nav import Navigation
from mkdocs.utils import get_relative_url

_scopes = {}
_pages = {}


def on_config(config):
    nav = []
    for locale in ("fr", "en"):
        prefix = "en/" if locale == "en" else ""
        for guide in config.extra["documentation_guides"]:
            items = []
            for chapter in guide["chapters"]:
                if "pages" in chapter:
                    items.append(
                        {
                            chapter[locale]: [
                                {entry[locale]: prefix + entry["file"]}
                                for entry in chapter["pages"]
                            ]
                        }
                    )
                else:
                    items.append({chapter[locale]: prefix + chapter["file"]})
            nav.append({f"{locale}-{guide['id']}": items})
    config.nav = nav
    return config


def on_nav(nav, *, config, files):
    _scopes.clear()
    _pages.clear()
    guides = {guide["id"]: guide for guide in config.extra["documentation_guides"]}
    for section in nav.items:
        locale, guide_id = section.title.split("-", 1)
        pages = [page for page in nav.pages if section in page.ancestors]
        local_nav = Navigation(section.children, pages)
        local_nav.homepage = pages[0]
        # Remove the artificial collection parent; keep chapter groups within it.
        for child in section.children:
            child.parent = None
        for index, page in enumerate(pages):
            page.previous_page = pages[index - 1] if index else None
            page.next_page = pages[index + 1] if index + 1 < len(pages) else None
            _pages[page.file.src_uri] = (locale, guide_id)
        _scopes[(locale, guide_id)] = (local_nav, guides[guide_id])
    missing = {file.src_uri for file in files.documentation_pages()} - _pages.keys()
    if missing:
        raise PluginError(f"Pages missing a documentation guide: {sorted(missing)}")
    return nav


def on_page_context(context, *, page, config, nav):
    locale, guide_id = _pages[page.file.src_uri]
    local_nav, guide = _scopes[(locale, guide_id)]
    # Never mutate the shared config: rendering English must not affect later French pages.
    local_config = dict(config)
    local_config["theme"] = dict(config.theme)
    local_config["theme"]["language"] = locale
    local_config["site_name"] = "LifeOS · " + guide[locale]
    local_config["site_description"] = guide[locale]
    local_config["extra"] = dict(config.extra)
    local_config["extra"]["social"] = [
        {**item, "name": ("Source code on GitHub" if "github" in item["link"] else "Open LifeOS")}
        if locale == "en"
        else dict(item)
        for item in config.extra["social"]
    ]
    source = page.file.src_uri.removeprefix("en/")
    alternate_source = source if locale == "en" else "en/" + source
    if alternate_source not in _pages:
        raise PluginError(f"Missing translation for {page.file.src_uri}")
    alternate = next(p for p in nav.pages if p.file.src_uri == alternate_source)
    # The toolbar links directly to the equivalent page. Material's built-in
    # language selector assumes separate site roots and probes their sitemaps.
    local_config["extra"].pop("alternate", None)
    local_config["extra"]["homepage"] = local_nav.homepage.url
    # Search is scoped in on_post_page, while normal assets retain MkDocs' base_url.
    context.update(
        config=local_config,
        nav=local_nav,
        guide={
            "id": guide_id,
            "locale": locale,
            "title": guide[locale],
            "directory": "en/" if locale == "en" else ".",
            "alternate": alternate.url,
        },
    )
    return context


def on_post_page(output, *, page, config):
    locale, guide_id = _pages[page.file.src_uri]
    base = get_relative_url(f"_guides/{locale}-{guide_id}/", page.url)

    def scope_search(match):
        settings = json.loads(match.group(2))
        settings["base"] = base
        return match.group(1) + json.dumps(settings, ensure_ascii=False) + match.group(3)

    output, count = re.subn(
        r'(<script id="__config" type="application/json">)(.*?)(</script>)',
        scope_search,
        output,
        flags=re.DOTALL,
    )
    if count != 1:
        raise PluginError("Material search configuration changed; verify guide search integration")
    return output


@event_priority(-100)
def on_post_build(config):
    root = Path(config.site_dir)
    index = json.loads((root / "search/search_index.json").read_text())
    for (locale, guide_id), (nav, _) in _scopes.items():
        urls = {page.url for page in nav.pages}
        entries = [
            dict(entry, location=posixpath.join("../..", entry["location"]))
            for entry in index["docs"]
            if entry["location"].split("#")[0] in urls
        ]
        destination = root / "_guides" / f"{locale}-{guide_id}" / "search/search_index.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        data = {**index, "config": {**index["config"], "lang": [locale]}, "docs": entries}
        destination.write_text(json.dumps(data, ensure_ascii=False))
