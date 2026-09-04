"""Fetch agency identity assets from official organisation websites.

The downloaded files are used only as factual identifiers in the CEOS-ARD
prototype. Trademarks and logos remain the property of their respective owners.
Run this script manually when the bundled catalogue agency list changes.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

import requests


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "agency_logos"
USER_AGENT = "CEOS-ARD-Product-Explorer/1.0 (agency identity asset fetcher)"


@dataclass(frozen=True)
class AgencySource:
    label: str
    slug: str
    homepage: str


AGENCIES = [
    AgencySource("AIR-CAS", "aircas", "https://english.aircas.ac.cn/"),
    AgencySource("CSIRO", "csiro", "https://www.csiro.au/"),
    AgencySource("Catalyst/PCI", "catalyst", "https://catalyst.earth/"),
    AgencySource("Constellr", "constellr", "https://constellr.com/"),
    AgencySource("DLR", "dlr", "https://www.dlr.de/en"),
    AgencySource("ESA", "esa", "https://www.esa.int/"),
    AgencySource("EarthDaily", "earthdaily", "https://earthdaily.com/"),
    AgencySource("Geoscience Australia", "geoscience-australia", "https://www.ga.gov.au/"),
    AgencySource("ISRO", "isro", "https://www.isro.gov.in/"),
    AgencySource("JAXA", "jaxa", "https://global.jaxa.jp/"),
    AgencySource("NASA/JPL", "nasa-jpl", "https://www.jpl.nasa.gov/"),
    AgencySource("NRCan", "nrcan", "https://natural-resources.canada.ca/"),
    AgencySource("Sinergise and Digital Earth Africa", "digital-earth-africa", "https://digitalearthafrica.org/"),
    AgencySource("Synspective", "synspective", "https://synspective.com/"),
    AgencySource("USGS", "usgs", "https://www.usgs.gov/"),
    AgencySource("VITO/ESA", "vito", "https://vito.be/en"),
]

# Crowded homepages often expose partner marks before their own identity asset.
# These official-site overrides keep the fetch deterministic for those cases.
ASSET_OVERRIDES: dict[str, str] = {
    "Constellr": "https://cdn.prod.website-files.com/694266bf80292257d6fd8603/696fc0050e82fe9748d6d534_constellr_webclip.png",
    "DLR": "https://www.dlr.de/static/media/Logo-en.bc10c5b6.svg",
    "ISRO": "https://www.isro.gov.in/media_isro/image/favicon.png.webp",
    # JAXA explicitly provides this banner for links to its site.
    "JAXA": "https://global.jaxa.jp/images/banner_l_e.jpg",
    "NASA/JPL": "https://www.jpl.nasa.gov/favicon.ico",
    "Sinergise and Digital Earth Africa": "https://digitalearthafrica.org/wp-content/uploads/DE_Africa_Logo_Primary_RGB_1-1.png",
    "Synspective": "https://synspective.com/wp-content/themes/synspective/common/favicons/favicon.svg",
}

# These sites publish white header marks; their identity systems also provide a
# black/monochrome treatment for light surfaces.
DISPLAY_TREATMENTS = {
    "Catalyst/PCI": "monochrome-dark",
    "ESA": "monochrome-dark",
    "USGS": "monochrome-dark",
}


class AssetParser(HTMLParser):
    def __init__(self, homepage: str) -> None:
        super().__init__()
        self.homepage = homepage
        self.candidates: list[tuple[int, str, str]] = []
        self._header_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.casefold(): value or "" for key, value in attrs}
        if tag.casefold() in {"header", "nav"}:
            self._header_depth += 1
        if tag.casefold() == "img":
            source = values.get("src") or values.get("data-src") or values.get("data-lazy-src")
            if not source or source.startswith("data:"):
                return
            description = " ".join(
                [source, values.get("alt", ""), values.get("class", ""), values.get("id", "")]
            ).casefold()
            score = 0
            if "logo" in description or "brand" in description:
                score += 90
            if self._header_depth:
                score += 35
            if source.casefold().endswith(".svg"):
                score += 25
            if any(term in description for term in ("white", "negative", "reverse", "footer")):
                score -= 45
            if score > 0:
                self.candidates.append((score, urljoin(self.homepage, source), "page logo"))
        if tag.casefold() == "link":
            rel = values.get("rel", "").casefold()
            source = values.get("href", "")
            if source and "icon" in rel:
                score = 45 if "apple-touch" in rel else 30
                sizes = values.get("sizes", "")
                match = re.search(r"(\d+)x(\d+)", sizes)
                if match:
                    score += min(int(match.group(1)), 512) // 16
                self.candidates.append((score, urljoin(self.homepage, source), "site icon"))
        if tag.casefold() == "meta":
            key = (values.get("property") or values.get("name") or "").casefold()
            source = values.get("content", "")
            if source and key in {"og:logo", "twitter:image:src", "msapplication-tileimage"}:
                self.candidates.append((35, urljoin(self.homepage, source), key))

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() in {"header", "nav"} and self._header_depth:
            self._header_depth -= 1


def extension_for(content_type: str, url: str, payload: bytes) -> tuple[str, str] | None:
    clean_type = content_type.split(";", 1)[0].strip().casefold()
    suffix = Path(urlparse(url).path).suffix.casefold()
    if payload.lstrip().startswith(b"<svg") or b"<svg" in payload[:500].lower():
        return ".svg", "image/svg+xml"
    if payload.startswith(b"\x89PNG"):
        return ".png", "image/png"
    if payload.startswith((b"\xff\xd8\xff",)):
        return ".jpg", "image/jpeg"
    if payload.startswith((b"\x00\x00\x01\x00", b"\x00\x00\x02\x00")):
        return ".ico", "image/x-icon"
    if payload.startswith(b"RIFF") and payload[8:12] == b"WEBP":
        return ".webp", "image/webp"
    known = {
        "image/svg+xml": ".svg", "image/png": ".png", "image/jpeg": ".jpg",
        "image/webp": ".webp", "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico",
    }
    if clean_type in known:
        return known[clean_type], clean_type
    if suffix in {".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"}:
        return (".jpg" if suffix == ".jpeg" else suffix), f"image/{suffix.removeprefix('.')}"
    return None


def discover_candidates(session: requests.Session, source: AgencySource) -> tuple[str, list[tuple[int, str, str]]]:
    response = session.get(source.homepage, timeout=30)
    response.raise_for_status()
    parser = AssetParser(str(response.url))
    parser.feed(response.text)
    parser.candidates.extend(
        [
            (12, urljoin(str(response.url), "/apple-touch-icon.png"), "conventional site icon"),
            (8, urljoin(str(response.url), "/favicon.ico"), "conventional favicon"),
        ]
    )
    return str(response.url), sorted(parser.candidates, reverse=True)


def fetch_logo(session: requests.Session, source: AgencySource) -> dict[str, str]:
    try:
        resolved_homepage, candidates = discover_candidates(session, source)
    except requests.RequestException:
        if source.label not in ASSET_OVERRIDES:
            raise
        resolved_homepage, candidates = source.homepage, []
    if override := ASSET_OVERRIDES.get(source.label):
        candidates.insert(0, (1000, override, "curated official asset"))

    seen: set[str] = set()
    errors: list[str] = []
    for _, asset_url, source_kind in candidates:
        if asset_url in seen:
            continue
        seen.add(asset_url)
        try:
            asset = session.get(asset_url, headers={"Referer": resolved_homepage}, timeout=30)
            asset.raise_for_status()
            if not (100 <= len(asset.content) <= 2_500_000):
                raise ValueError(f"unexpected asset size {len(asset.content)}")
            detected = extension_for(asset.headers.get("Content-Type", ""), str(asset.url), asset.content)
            if not detected:
                raise ValueError(f"unsupported content type {asset.headers.get('Content-Type')}")
            extension, mime_type = detected
            filename = f"{source.slug}{extension}"
            (OUTPUT_DIR / filename).write_bytes(asset.content)
            return {
                "file": filename,
                "homepage": source.homepage,
                "asset_url": str(asset.url),
                "mime_type": mime_type,
                "source_kind": source_kind,
            }
        except (requests.RequestException, ValueError) as exc:
            errors.append(f"{asset_url}: {exc}")
    raise RuntimeError(f"No usable logo for {source.label}. " + " | ".join(errors[-4:]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="Fetch only a named agency label (repeatable).")
    parser.add_argument(
        "--inspect",
        action="append",
        help="List discovered asset candidates for a named agency without downloading them.",
    )
    args = parser.parse_args()
    requested = args.inspect or args.only
    selected = [source for source in AGENCIES if not requested or source.label in set(requested)]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,image/*;q=0.9,*/*;q=0.5"})
    if args.inspect:
        for source in selected:
            try:
                _, candidates = discover_candidates(session, source)
                print(f"\n{source.label}")
                for score, asset_url, source_kind in candidates:
                    print(f"  {score:>3}  {source_kind:<26} {asset_url}")
            except requests.RequestException as exc:
                print(f"FAILED {source.label}: {exc}")
        return 0
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {
        "notice": "Agency marks are shown for factual identification only; ownership remains with each organisation.",
        "agencies": {},
    }
    failures: list[str] = []
    for source in selected:
        try:
            record = fetch_logo(session, source)
            if treatment := DISPLAY_TREATMENTS.get(source.label):
                record["display_treatment"] = treatment
            manifest["agencies"][source.label] = record
            print(f"{source.label}: {record['file']} <- {record['asset_url']}")
        except (requests.RequestException, RuntimeError) as exc:
            failures.append(f"{source.label}: {exc}")
            print(f"FAILED {source.label}: {exc}")
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if failures:
        print("\n".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
