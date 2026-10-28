#!/usr/bin/env python3
"""Repository hygiene checks for the community contribution kit.

Checks:
  * Issue forms in .github/ISSUE_TEMPLATE parse as YAML, validate against the
    SchemaStore issue-form schema, and meet this project's own rules (required
    top-level keys, unique field ids, labels defined in .github/labels.yml,
    required public-source fields, and the `section` field the site's
    "Suggest a change" link prefills).
  * .github/ISSUE_TEMPLATE/config.yml disables blank issues and has valid
    contact links.
  * .github/labels.yml is well formed.
  * Markdown links in CONTRIBUTING.md, docs/MAINTAINERS.md, the pull request
    template and the issue forms resolve: relative links and links into this
    repository must point at files that exist; external links must respond.

Usage: python3 .github/scripts/repo_hygiene.py [--offline] [--schema-dir DIR]
  --offline     skip network checks (external links and schema download)
  --schema-dir  read github-issue-forms.json / github-issue-config.json from
                DIR instead of downloading them from SchemaStore
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

import jsonschema
import yaml

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = ROOT / ".github" / "ISSUE_TEMPLATE"
LABELS_FILE = ROOT / ".github" / "labels.yml"
REPO_SLUG = "aws-samples/sample-aws-ai-tokenomics-finops"
REPO_URL = f"https://github.com/{REPO_SLUG}"

SCHEMA_URLS = {
    "form": "https://json.schemastore.org/github-issue-forms.json",
    "config": "https://json.schemastore.org/github-issue-config.json",
}
SCHEMA_FILES = {"form": "github-issue-forms.json", "config": "github-issue-config.json"}

ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
HEX_RE = re.compile(r"^[0-9a-fA-F]{6}$")
FIELD_TYPES = {"markdown", "input", "textarea", "dropdown", "checkboxes"}

# Fields each form must keep as required, so evidence is always collected.
REQUIRED_FIELDS = {
    "content-correction.yml": {"section", "problem", "proposed-text", "source-url"},
    "pricing-update.yml": {"model-or-service", "old-price", "new-price", "pricing-url", "as-of-date"},
    "new-lever.yml": {"track", "problem", "technique", "expected-saving", "evidence"},
    "site-bug.yml": {"browser", "steps"},
}

# Markdown files whose links are checked, relative to the repository root.
MARKDOWN_FILES = [
    "CONTRIBUTING.md",
    "docs/MAINTAINERS.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
]

MD_LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
BARE_URL_RE = re.compile(r"https?://[^\s)>\]`\"']+")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.passed = 0

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def ok(self) -> None:
        self.passed += 1


def load_schema(kind: str, schema_dir: Path | None) -> dict:
    if schema_dir is not None:
        return json.loads((schema_dir / SCHEMA_FILES[kind]).read_text())
    req = urllib.request.Request(SCHEMA_URLS[kind], headers={"User-Agent": "repo-hygiene"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def load_label_names(rep: Report) -> set[str]:
    try:
        data = yaml.safe_load(LABELS_FILE.read_text())
    except Exception as exc:  # noqa: BLE001
        rep.error(f"{LABELS_FILE.relative_to(ROOT)}: does not parse: {exc}")
        return set()
    names: set[str] = set()
    if not isinstance(data, list) or not data:
        rep.error(".github/labels.yml: must be a non-empty list")
        return names
    for i, item in enumerate(data):
        where = f".github/labels.yml[{i}]"
        if not isinstance(item, dict):
            rep.error(f"{where}: must be a mapping")
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            rep.error(f"{where}: missing name")
            continue
        if name in names:
            rep.error(f"{where}: duplicate label '{name}'")
        names.add(name)
        if len(name) > 50:
            rep.error(f"{where}: name longer than 50 characters")
        if not HEX_RE.match(str(item.get("color", ""))):
            rep.error(f"{where}: color must be 6 hex digits without '#'")
        desc = item.get("description", "")
        if not isinstance(desc, str) or len(desc) > 100:
            rep.error(f"{where}: description must be a string of at most 100 characters")
    rep.ok()
    return names


def check_form(path: Path, schema: dict | None, labels: set[str], rep: Report) -> list[str]:
    rel = path.relative_to(ROOT)
    texts: list[str] = []
    try:
        form = yaml.safe_load(path.read_text())
    except Exception as exc:  # noqa: BLE001
        rep.error(f"{rel}: does not parse: {exc}")
        return texts
    if not isinstance(form, dict):
        rep.error(f"{rel}: top level must be a mapping")
        return texts
    if schema is not None:
        errors = sorted(jsonschema.Draft7Validator(schema).iter_errors(form), key=lambda e: list(e.path))
        for err in errors:
            loc = "/".join(str(p) for p in err.path) or "<root>"
            rep.error(f"{rel}: schema: {loc}: {err.message}")
    for key in ("name", "description", "body"):
        if key not in form:
            rep.error(f"{rel}: missing required top-level key '{key}'")
    for label in form.get("labels", []) or []:
        if label not in labels:
            rep.error(f"{rel}: label '{label}' is not defined in .github/labels.yml")
    body = form.get("body")
    if not isinstance(body, list) or not body:
        rep.error(f"{rel}: body must be a non-empty list")
        return texts
    ids: dict[str, dict] = {}
    if not any(isinstance(el, dict) and el.get("type") != "markdown" for el in body):
        rep.error(f"{rel}: body needs at least one non-markdown field")
    for i, el in enumerate(body):
        where = f"{rel}: body[{i}]"
        if not isinstance(el, dict):
            rep.error(f"{where}: must be a mapping")
            continue
        etype = el.get("type")
        attrs = el.get("attributes") or {}
        if etype not in FIELD_TYPES:
            rep.error(f"{where}: unknown type '{etype}'")
            continue
        for key in ("value", "description"):
            if isinstance(attrs.get(key), str):
                texts.append(attrs[key])
        for opt in attrs.get("options", []) or []:
            if isinstance(opt, dict) and isinstance(opt.get("label"), str):
                texts.append(opt["label"])
        if etype == "markdown":
            continue
        fid = el.get("id")
        if not isinstance(fid, str) or not ID_RE.match(fid):
            rep.error(f"{where}: id must use only letters, digits, '-' and '_'")
            continue
        if fid in ids:
            rep.error(f"{where}: duplicate id '{fid}'")
        ids[fid] = el
        if not attrs.get("label"):
            rep.error(f"{where}: missing attributes.label")
        if etype in ("dropdown", "checkboxes") and not attrs.get("options"):
            rep.error(f"{where}: {etype} needs options")
    for fid in sorted(REQUIRED_FIELDS.get(path.name, set())):
        el = ids.get(fid)
        if el is None:
            rep.error(f"{rel}: expected field id '{fid}'")
        elif not (el.get("validations") or {}).get("required"):
            rep.error(f"{rel}: field '{fid}' must be required")
    if path.name == "content-correction.yml":
        section = ids.get("section")
        if section is not None and section.get("type") not in ("input", "textarea"):
            rep.error(f"{rel}: 'section' must be an input or textarea so URL prefill works")
    rep.ok()
    return texts


def check_config(schema: dict | None, rep: Report) -> list[str]:
    path = TEMPLATE_DIR / "config.yml"
    rel = path.relative_to(ROOT)
    urls: list[str] = []
    if not path.exists():
        rep.error(f"{rel}: missing")
        return urls
    try:
        cfg = yaml.safe_load(path.read_text())
    except Exception as exc:  # noqa: BLE001
        rep.error(f"{rel}: does not parse: {exc}")
        return urls
    if schema is not None:
        for err in jsonschema.Draft7Validator(schema).iter_errors(cfg):
            loc = "/".join(str(p) for p in err.path) or "<root>"
            rep.error(f"{rel}: schema: {loc}: {err.message}")
    if cfg.get("blank_issues_enabled") is not False:
        rep.error(f"{rel}: blank_issues_enabled must be false")
    links = cfg.get("contact_links") or []
    if not links:
        rep.error(f"{rel}: contact_links must not be empty")
    for i, link in enumerate(links):
        for key in ("name", "url", "about"):
            if not link.get(key):
                rep.error(f"{rel}: contact_links[{i}] missing '{key}'")
        url = str(link.get("url", ""))
        if not url.startswith("https://"):
            rep.error(f"{rel}: contact_links[{i}] url must use https")
        urls.append(url)
    if not any("vulnerability-reporting" in u for u in urls):
        rep.error(f"{rel}: contact_links must include the AWS security vulnerability reporting page")
    rep.ok()
    return urls


def extract_links(text: str) -> list[str]:
    links = MD_LINK_RE.findall(text)
    # Bare URLs that are not part of a markdown link target.
    stripped = MD_LINK_RE.sub("", text)
    links.extend(BARE_URL_RE.findall(stripped))
    return [link.rstrip(".,;:") for link in links]


def check_own_repo_url(url: str, source: str, rep: Report) -> None:
    rest = url[len(REPO_URL):].lstrip("/")
    path_part, _, query = rest.partition("?")
    path_part = path_part.split("#", 1)[0]
    if path_part.startswith(("blob/main/", "tree/main/")):
        target = ROOT / path_part.split("/", 2)[2]
        if not target.exists():
            rep.error(f"{source}: link to missing repository file: {url}")
        return
    if path_part == "issues/new":
        match = re.search(r"(?:^|&)template=([^&]+)", query)
        if match and not (TEMPLATE_DIR / match.group(1)).exists():
            rep.error(f"{source}: link to missing issue form: {url}")
        return
    # Other repository pages (issues, discussions, pulls, ...) cannot be
    # fetched while the repository is private, so they are accepted by form.
    if path_part.split("/", 1)[0] not in ("", "issues", "discussions", "pulls", "labels"):
        rep.warn(f"{source}: unrecognized repository link, not checked: {url}")


def check_external(url: str, source: str, cache: dict[str, str | None], rep: Report) -> None:
    if url not in cache:
        cache[url] = None
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (repo-hygiene link check)"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status >= 400:
                    cache[url] = f"HTTP {resp.status}"
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403, 429):
                rep.warn(f"{source}: {url} answered HTTP {exc.code} (reachable, access restricted)")
            else:
                cache[url] = f"HTTP {exc.code}"
        except Exception as exc:  # noqa: BLE001
            cache[url] = f"{type(exc).__name__}: {exc}"
    if cache[url]:
        rep.error(f"{source}: broken link {url} ({cache[url]})")


def check_links(sources: dict[str, list[str]], offline: bool, rep: Report) -> int:
    cache: dict[str, str | None] = {}
    count = 0
    for source, texts in sources.items():
        base = (ROOT / source).parent
        for text in texts:
            for link in extract_links(text):
                count += 1
                if link.startswith("mailto:") or link.startswith("#"):
                    continue
                if link.startswith(REPO_URL):
                    check_own_repo_url(link, source, rep)
                elif link.startswith(("http://", "https://")):
                    if link.startswith("http://"):
                        rep.error(f"{source}: use https: {link}")
                    elif not offline:
                        check_external(link, source, cache, rep)
                else:
                    target = (base / link.split("#", 1)[0]).resolve()
                    if not target.exists():
                        rep.error(f"{source}: relative link to missing file: {link}")
    rep.ok()
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--schema-dir", type=Path)
    args = parser.parse_args()
    rep = Report()

    form_schema = config_schema = None
    if args.schema_dir or not args.offline:
        try:
            form_schema = load_schema("form", args.schema_dir)
            config_schema = load_schema("config", args.schema_dir)
        except Exception as exc:  # noqa: BLE001
            rep.error(f"could not load SchemaStore schemas: {exc}")
    else:
        rep.warn("offline: SchemaStore schema validation skipped")

    labels = load_label_names(rep)
    sources: dict[str, list[str]] = {}
    forms = sorted(p for p in TEMPLATE_DIR.glob("*.y*ml") if p.name not in ("config.yml", "config.yaml"))
    if not forms:
        rep.error(".github/ISSUE_TEMPLATE: no issue forms found")
    for path in forms:
        sources[str(path.relative_to(ROOT))] = check_form(path, form_schema, labels, rep)
    if not (TEMPLATE_DIR / "content-correction.yml").exists():
        rep.error(".github/ISSUE_TEMPLATE/content-correction.yml: required by the site's Suggest a change link")
    sources[".github/ISSUE_TEMPLATE/config.yml"] = check_config(config_schema, rep)
    for md in MARKDOWN_FILES:
        path = ROOT / md
        if path.exists():
            sources[md] = [path.read_text()]
        else:
            rep.error(f"{md}: missing")
    links = check_links(sources, args.offline, rep)

    for msg in rep.warnings:
        print(f"WARN  {msg}")
    for msg in rep.errors:
        print(f"ERROR {msg}")
    print(
        f"repo-hygiene: {len(forms)} issue forms, {len(labels)} labels, {links} links checked; "
        f"{rep.passed} check groups run, {len(rep.errors)} errors, {len(rep.warnings)} warnings"
    )
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
