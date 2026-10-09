# Legacy Streamlit prototype (migration reference)

This is the original Python/Streamlit implementation, kept unchanged in behaviour so the TypeScript rebuild can be checked against it. It is **not** used by the web application and is **not** a production dependency.

Changes made when it was moved here:

- FedEO modules, tests and the `ENABLE_FEDEO_INTEGRATION` flag were removed (FedEO is retired).
- Data and asset paths now point to the repository root (`data/`, `assets/`).
- `requirements.txt` pins the versions that pass the baseline (Streamlit 1.59.1). Streamlit 1.65 changes `AppTest` path resolution and breaks 19 tests.

Run its tests (Python 3.11+):

```bash
cd legacy/streamlit-prototype
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v     # 33 tests
```

Regenerate the parity fixtures used by `tests/unit/parity-*.test.ts`, from the repository root:

```bash
python legacy/streamlit-prototype/generate_parity_fixtures.py
```

Delete this directory once the owner no longer needs the reference. Remove the `legacy-parity` CI job at the same time, and keep the committed fixtures.
