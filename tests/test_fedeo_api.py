"""Network-free tests for the optional FedEO HTTP client."""

from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import requests

from fedeo_api import (
    COLLECTIONS_URL,
    REQUEST_HEADERS,
    REQUEST_TIMEOUT,
    FedeoApiError,
    FedeoServiceError,
    get_collection,
    search_collections,
)


def response(status: int = 200, payload=None, *, json_error: Exception | None = None) -> Mock:
    value = Mock()
    value.status_code = status
    if json_error is not None:
        value.json.side_effect = json_error
    else:
        value.json.return_value = payload
    return value


class FedeoClientTests(unittest.TestCase):
    def test_search_returns_raw_valid_collections_and_skips_malformed_entries(self) -> None:
        valid = {"id": "S2-L2A", "type": "Collection", "title": "Sentinel-2 Level-2A", "extra": {"raw": True}}
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(
            payload={"collections": [valid, None, {}, {"id": 9}], "links": []}
        )

        results = search_collections(" Sentinel-2 Level-2A ", session=client)

        self.assertEqual(results, [valid])
        self.assertIs(results[0], valid)
        self.assertEqual(client.headers, REQUEST_HEADERS)
        client.get.assert_called_once_with(
            COLLECTIONS_URL,
            params={"q": "Sentinel-2 Level-2A", "limit": 8},
            timeout=REQUEST_TIMEOUT,
        )

    def test_search_uses_a_requests_session_when_none_is_supplied(self) -> None:
        with patch("fedeo_api.requests.Session") as session_type:
            client = session_type.return_value
            client.get.return_value = response(payload={"collections": [], "links": []})

            self.assertEqual(search_collections("EnMAP"), [])

        client.headers.update.assert_called_once_with(REQUEST_HEADERS)

    def test_get_collection_encodes_identifier_and_returns_raw_dict(self) -> None:
        collection = {"id": "EOP:ESA:S2", "type": "Collection", "summaries": {"platform": ["Sentinel-2"]}}
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(payload=collection)

        result = get_collection("EOP:ESA:S2", session=client)

        self.assertIs(result, collection)
        client.get.assert_called_once_with(
            f"{COLLECTIONS_URL}/EOP%3AESA%3AS2",
            params=None,
            timeout=REQUEST_TIMEOUT,
        )

    def test_get_collection_returns_none_for_404(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(status=404)

        self.assertIsNone(get_collection("not-present", session=client))

    def test_pagination_follows_only_same_host_https_next_and_respects_bound(self) -> None:
        first = response(
            payload={
                "collections": [{"id": "one"}],
                "links": [{"rel": "next", "href": "https://fedeo.ceos.org/collections?q=EnMAP&startRecord=2"}],
            }
        )
        second = response(
            payload={
                "collections": [{"id": "two"}],
                "links": [{"rel": "next", "href": "https://fedeo.ceos.org/collections?q=EnMAP&startRecord=3"}],
            }
        )
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.side_effect = [first, second]

        results = search_collections("EnMAP", limit=2, max_pages=2, session=client)

        self.assertEqual([item["id"] for item in results], ["one", "two"])
        self.assertEqual(client.get.call_count, 2)
        self.assertEqual(client.get.call_args_list[1].kwargs["params"], None)

    def test_off_host_next_link_is_not_followed(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(
            payload={
                "collections": [{"id": "one"}],
                "links": [{"rel": "next", "href": "https://example.test/collections?startRecord=2"}],
            }
        )

        results = search_collections("test", max_pages=2, session=client)

        self.assertEqual([item["id"] for item in results], ["one"])
        self.assertEqual(client.get.call_count, 1)

    def test_timeout_is_a_service_error(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.side_effect = requests.Timeout("slow")

        with self.assertRaises(FedeoServiceError):
            search_collections("Sentinel-1", session=client)

    def test_ordinary_http_error_is_lookup_local(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(status=400)

        with self.assertRaises(FedeoApiError) as raised:
            search_collections("bad query", session=client)

        self.assertNotIsInstance(raised.exception, FedeoServiceError)
        self.assertEqual(client.get.call_count, 1)

    def test_server_error_is_retried_once_then_becomes_service_error(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.side_effect = [response(status=503), response(status=503)]

        with self.assertRaises(FedeoServiceError):
            search_collections("Sentinel-1", session=client)

        self.assertEqual(client.get.call_count, 2)

    def test_invalid_json_is_a_service_error(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(json_error=ValueError("invalid"))

        with self.assertRaises(FedeoServiceError):
            search_collections("Sentinel-1", session=client)

    def test_invalid_detail_json_is_lookup_local(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(json_error=ValueError("invalid"))

        with self.assertRaises(FedeoApiError) as raised:
            get_collection("Sentinel-1", session=client)

        self.assertNotIsInstance(raised.exception, FedeoServiceError)

    def test_malformed_search_shape_is_a_service_error(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(payload={"features": []})

        with self.assertRaises(FedeoServiceError):
            search_collections("Sentinel-1", session=client)

    def test_geojson_feature_detail_is_rejected_instead_of_silently_unwrapped(self) -> None:
        client = Mock(spec=requests.Session)
        client.headers = {}
        client.get.return_value = response(
            payload={"id": "S2", "type": "Feature", "properties": {"title": "Sentinel-2"}}
        )

        with self.assertRaises(FedeoApiError) as raised:
            get_collection("S2", session=client)

        self.assertNotIsInstance(raised.exception, FedeoServiceError)


if __name__ == "__main__":
    unittest.main()
