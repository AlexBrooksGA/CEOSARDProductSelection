"""Network-free coverage for tolerant FedEO collection normalisation."""

from __future__ import annotations

import unittest

from fedeo_normalisation import normalise_collection


class FedeoNormalisationTests(unittest.TestCase):
    def test_standard_and_provider_aliases_are_normalised_with_provenance(self) -> None:
        raw = {
            "ID": "S2_L2A-1",
            "Title": "Sentinel-2 - Level-2A - Cloud Optimized GeoTIFF",
            "Description": "Optical surface reflectance collection",
            "SCI:DOI": "10.1234/example",
            "License": "CC-BY-4.0",
            "Providers": [
                {"Name": "ESA/ESRIN", "Roles": ["producer"], "URL": "https://www.esa.int"},
                {"Name": "FedEO", "Roles": ["host"], "URL": "https://fedeo.ceos.org"},
            ],
            "Summaries": {
                "Platform": ["Sentinel-2"],
                "Instrument": ["MSI"],
                "processing_level": ["L2A"],
                "product:type": ["Surface Reflectance"],
                "gsd": [10, 20, 60],
                "bands": ["B02", "B03"],
            },
            "Extent": {
                "Spatial": {"BBox": [[-180, -90, 180, 90]]},
                "Temporal": {"Interval": [["2015-06-23T00:00:00Z", None]]},
            },
            "Item_Assets": {
                "reflectance": {
                    "type": "image/tiff; application=geotiff; profile=cloud-optimized",
                    "roles": ["data"],
                    "raster:bands": [{"data_type": "uint16"}],
                    "proj:epsg": 32655,
                }
            },
            "Assets": {
                "preview_quicklook": {
                    "href": "https://example.test/quicklook.jpg",
                    "roles": ["quicklook"],
                    "type": "image/jpeg",
                },
                "metadata_iso": {
                    "href": "https://example.test/metadata.xml",
                    "roles": ["metadata"],
                    "type": "application/xml",
                },
            },
            "Links": [{"rel": "self", "href": "https://fedeo.ceos.org/collections/S2_L2A-1"}],
        }

        collection = normalise_collection(raw)

        self.assertEqual(collection.collection_id, "S2_L2A-1")
        self.assertEqual(collection.title, raw["Title"])
        self.assertEqual(collection.value("platforms"), ["Sentinel-2"])
        self.assertEqual(collection.value("instruments"), ["MSI"])
        self.assertEqual(collection.value("processing_levels"), ["L2A"])
        self.assertEqual(collection.value("product_type"), ["Surface Reflectance"])
        self.assertEqual(collection.value("ground_sample_distance_m"), [10.0, 20.0, 60.0])
        self.assertEqual(collection.value("agency"), ["ESA/ESRIN"])
        self.assertEqual(len(collection.value("providers")), 2)
        self.assertEqual(collection.value("doi"), "10.1234/example")
        self.assertEqual(collection.value("licence"), "CC-BY-4.0")
        self.assertEqual(collection.value("data_formats"), ["Cloud Optimized GeoTIFF"])
        self.assertEqual(collection.value("raster_data_types"), ["uint16"])
        self.assertEqual(collection.value("output_storage_bit_depth"), [16])
        self.assertEqual(collection.value("coordinate_reference_systems"), ["EPSG:32655"])
        self.assertEqual(collection.value("quicklook_urls"), ["https://example.test/quicklook.jpg"])
        self.assertEqual(collection.value("metadata_urls"), ["https://example.test/metadata.xml"])
        self.assertEqual(collection.value("record_url"), "https://fedeo.ceos.org/collections/S2_L2A-1")
        self.assertEqual(collection.field("doi").source, "fedeo")  # type: ignore[union-attr]
        self.assertEqual(collection.field("doi").api_path, "SCI:DOI")  # type: ignore[union-attr]

    def test_missing_summaries_and_assets_are_controlled(self) -> None:
        collection = normalise_collection({"id": "minimal", "title": "Minimal", "unknown": {"kept": True}})

        self.assertIsNone(collection.field("platforms"))
        self.assertIsNone(collection.field("data_urls"))
        self.assertEqual(collection.raw_response["unknown"], {"kept": True})

    def test_empty_and_open_temporal_extents_are_distinct(self) -> None:
        empty = normalise_collection(
            {"id": "empty", "title": "Empty", "extent": {"temporal": {"interval": []}}}
        )
        open_end = normalise_collection(
            {"id": "open", "title": "Open", "extent": {"temporal": {"interval": [["2020-01-01T00:00:00Z", None]]}}}
        )

        self.assertIsNone(empty.field("temporal_extent"))
        self.assertEqual(open_end.value("temporal_extent"), [["2020-01-01T00:00:00Z", None]])

    def test_output_storage_is_not_sensor_quantisation(self) -> None:
        collection = normalise_collection(
            {
                "id": "storage",
                "title": "Storage",
                "item_assets": {"image": {"raster:bands": [{"data_type": "uint16"}]}},
            }
        )

        self.assertEqual(collection.value("output_storage_bit_depth"), [16])
        self.assertEqual(collection.field("output_storage_bit_depth").basis, "derived_from_raster_data_type")  # type: ignore[union-attr]
        self.assertIsNone(collection.field("radiometric_bit_depth"))

    def test_sar_aliases_and_band_objects_are_retained(self) -> None:
        collection = normalise_collection(
            {
                "id": "sar", "title": "SAR",
                "summaries": {
                    "sar_frequency_band": "C",
                    "sar:polarisations": ["VV", "VH"],
                    "instrument_mode": ["IW"],
                    "bands": [{"name": "VV", "description": "co-polarised backscatter"}],
                },
            }
        )

        self.assertEqual(collection.value("sar_frequency_bands"), ["C"])
        self.assertEqual(collection.value("sar_polarisations"), ["VV", "VH"])
        self.assertEqual(collection.value("instrument_modes"), ["IW"])
        self.assertEqual(collection.value("bands")[0]["name"], "VV")

    def test_raw_response_is_deep_copied_and_unknown_fields_survive(self) -> None:
        raw = {"id": "raw", "title": "Raw", "vendor:block": {"nested": [1, 2]}}
        collection = normalise_collection(raw)
        raw["vendor:block"]["nested"].append(3)

        self.assertEqual(collection.raw_response["vendor:block"]["nested"], [1, 2])


if __name__ == "__main__":
    unittest.main()
