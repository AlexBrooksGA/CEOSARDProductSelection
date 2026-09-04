"""Small, failure-isolated client for optional FedEO collection metadata.

The client deliberately returns the FedEO dictionaries without normalising or
merging them.  Matching, provenance, and display policy belong to the separate
FedEO sidecar layers.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urljoin, urlparse

import requests


BASE_URL = "https://fedeo.ceos.org"
COLLECTIONS_URL = f"{BASE_URL}/collections"
REQUEST_TIMEOUT = (5, 10)
REQUEST_HEADERS = {
    # FedEO may otherwise content-negotiate a GeoJSON Feature wrapper rather
    # than the STAC Collection representation used by the normalisation layer.
    "Accept": "application/json",
    "User-Agent": "CEOS-ARD-Product-Explorer/experimental-fedeo",
}
_OFFICIAL_HOST = urlparse(BASE_URL).hostname


class FedeoApiError(RuntimeError):
    """A request or response error local to one FedEO lookup."""


class FedeoServiceError(FedeoApiError):
    """A FedEO service-wide failure suitable for an outage circuit breaker."""


def _session(session: requests.Session | None = None) -> requests.Session:
    client = session or requests.Session()
    client.headers.update(REQUEST_HEADERS)
    return client


def _request(client: requests.Session, url: str, *, params: dict[str, Any] | None = None) -> requests.Response:
    """GET one URL, retrying a rate-limit or server response at most once."""

    response: requests.Response | None = None
    for attempt in range(2):
        try:
            response = client.get(url, params=params, timeout=REQUEST_TIMEOUT)
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise FedeoServiceError("The FedEO service is unavailable or timed out.") from exc
        except requests.RequestException as exc:
            raise FedeoServiceError("The FedEO request could not be completed.") from exc

        if response.status_code == 429 or response.status_code >= 500:
            if attempt == 0:
                continue
            raise FedeoServiceError(f"The FedEO service returned HTTP {response.status_code}.")
        return response

    # The loop always returns or raises; this keeps the type contract explicit.
    raise FedeoServiceError("The FedEO request could not be completed.")


def _response_json(response: requests.Response, *, service_wide: bool) -> Any:
    try:
        return response.json()
    except (ValueError, requests.exceptions.JSONDecodeError) as exc:
        message = "The FedEO service returned invalid JSON."
        if service_wide:
            raise FedeoServiceError(message) from exc
        raise FedeoApiError(message) from exc


def _raise_for_client_error(response: requests.Response) -> None:
    if 400 <= response.status_code < 500:
        raise FedeoApiError(f"FedEO returned HTTP {response.status_code} for this lookup.")


def _is_collection(value: Any) -> bool:
    return isinstance(value, dict) and isinstance(value.get("id"), str) and bool(value["id"].strip())


def _next_url(payload: dict[str, Any], current_url: str) -> str | None:
    links = payload.get("links")
    if not isinstance(links, list):
        return None

    for link in links:
        if not isinstance(link, dict) or link.get("rel") != "next" or not isinstance(link.get("href"), str):
            continue
        candidate = urljoin(current_url, link["href"])
        parsed = urlparse(candidate)
        if (
            parsed.scheme == "https"
            and parsed.hostname == _OFFICIAL_HOST
            and parsed.username is None
            and parsed.password is None
        ):
            return candidate
    return None


def search_collections(
    query: str,
    *,
    limit: int = 8,
    max_pages: int = 1,
    session: requests.Session | None = None,
) -> list[dict[str, Any]]:
    """Return a bounded list of raw FedEO STAC collection candidates."""

    if not isinstance(query, str) or not query.strip():
        raise FedeoApiError("A non-empty FedEO search query is required.")
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise FedeoApiError("FedEO search limit must be a positive integer.")
    if not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1:
        raise FedeoApiError("FedEO max_pages must be a positive integer.")

    client = _session(session)
    results: list[dict[str, Any]] = []
    result_cap = limit * max_pages
    url: str | None = COLLECTIONS_URL
    params: dict[str, Any] | None = {"q": query.strip(), "limit": limit}

    for _ in range(max_pages):
        if url is None:
            break
        response = _request(client, url, params=params)
        _raise_for_client_error(response)
        payload = _response_json(response, service_wide=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("collections"), list):
            raise FedeoServiceError("The FedEO collection search response has an unexpected structure.")

        for collection in payload["collections"]:
            if _is_collection(collection):
                results.append(collection)
                if len(results) >= result_cap:
                    return results

        url = _next_url(payload, url)
        # The returned next link already contains its paging and search state.
        params = None

    return results


def get_collection(
    collection_id: str,
    *,
    session: requests.Session | None = None,
) -> dict[str, Any] | None:
    """Return one raw STAC Collection, or ``None`` when FedEO reports 404."""

    if not isinstance(collection_id, str) or not collection_id.strip():
        raise FedeoApiError("A non-empty FedEO collection identifier is required.")

    client = _session(session)
    encoded_id = quote(collection_id.strip(), safe="")
    response = _request(client, f"{COLLECTIONS_URL}/{encoded_id}")
    if response.status_code == 404:
        return None
    _raise_for_client_error(response)
    payload = _response_json(response, service_wide=False)

    if not _is_collection(payload):
        raise FedeoApiError("The FedEO collection response has an unexpected structure.")
    if payload.get("type") not in (None, "Collection"):
        raise FedeoApiError("FedEO did not return a STAC Collection representation.")
    return payload
