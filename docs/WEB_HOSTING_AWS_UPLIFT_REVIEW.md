> **Historical document (Streamlit era).** The application is now a single Node.js process (`node build`). FedEO has been removed. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for current instructions; the infrastructure guidance below still applies in principle.

# Web Hosting, AWS Deployment and Git-Based Development Review

Review date: 24 August 2026

Repository reviewed: CEOS-ARD Product Explorer

Review scope: assessment and recommendations only. No application code, configuration, dependency file, infrastructure, or Git history was modified for this review. The only deliverable created is this document.

## 1. Executive Summary

This repository is a working Streamlit proof of concept for discovering, filtering, shortlisting and comparing Earth-observation data products. It is not a traditional API, static website, batch pipeline or desktop application. The primary entry point is app.py; it loads a bundled JSON catalogue and profiles, renders a three-tab Streamlit interface, keeps user interaction state in st.session_state, and optionally calls two external services:

- an authenticated CEOS MIM API for additional product records; and
- the public FedEO service for optional, display-only collection metadata and bounded discovery.

The application is reasonably close to being hosted as a low-traffic website because its existing UI framework already provides the browser interaction model. The main barriers are operational rather than a need for a rewrite: there is no production startup contract, no committed Git history, no reproducible dependency lock, no CI/CD, no production secret injection, no health check or monitoring design, and no explicit decision about whether the site is public or private. The current .streamlit/config.toml is also local-development oriented (headless = false, runOnSave = true).

Recommended launch architecture for fewer than 5–10 users per day:

1. One small Linux Amazon Lightsail instance, initially 1 GB rather than 0.5 GB unless memory testing proves the smaller plan adequate.
2. The existing Streamlit process, launched by a service manager and bound only behind a local reverse proxy.
3. Caddy or Nginx on the same instance for HTTPS, browser access, and basic request protection.
4. The existing catalogue and static assets kept with the deployed release.
5. MIM credentials supplied at deploy time from a protected secret source, never committed or baked into an image.
6. GitHub Actions or an equivalent Git-based deployment job after the first manual deployment is proven.

This is an intentionally small, always-on architecture. Published Lightsail prices currently list a 1 GB Linux bundle with public IPv4 at approximately USD 7 per month before region, tax, transfer overages and optional services. The exact Australian-region bill should be confirmed in the AWS Pricing Calculator. This fixed cost is proportionate to the current workload and avoids forcing the present Streamlit application into Lambda, a separate frontend/backend, or a container platform.

The next architecture if usage grows is a containerised Streamlit deployment on ECS Express Mode or ordinary ECS/Fargate behind an Application Load Balancer, but only after real usage justifies the fixed networking and operational cost. If the product eventually needs durable accounts, saved profiles, uploads, generated files or multi-instance continuity, add persistence deliberately rather than introducing a database now.

The most important immediate actions are:

1. Decide whether the pilot is private or public, and protect it accordingly.
2. Ensure .env is never staged; rotate the MIM credential if it has ever been shared outside the local machine.
3. Establish the first real Git commit and clean the repository boundary.
4. Pin or lock the tested Python dependency set and define the supported Python version.
5. Add a production startup and HTTPS design around app.py.
6. Add a smoke test for the hosted startup path, plus CI execution of the existing test suite.
7. Move production secrets out of local-dotenv loading and into deploy-time secret injection.
8. Add basic logs, health checking, backups of the source repository, and a rollback procedure.

## 2. Assumptions

### Confirmed repository facts

- The primary user interface is Streamlit, launched from app.py.
- The repository contains 26 researched product records, 3 built-in profiles, local agency assets, optional external API adapters, tests, reports and generated output.
- The application has no database, ORM, upload flow, download generation flow, user account system, or application-owned persistent records.
- Custom profiles and comparison selections are held in st.session_state and are explicitly session-only.
- The bundled catalogue is loaded from local JSON. The application does not write runtime files.
- MIM credentials are read from environment variables. load_dotenv() is called by app.py.
- MIM calls are optional and the bundled catalogue remains available when the service fails.
- FedEO calls are optional, disabled by default in the application session, bounded and failure-isolated.
- The existing test suite contains 83 tests and passed when run with the repository virtual environment on 24 August 2026.
- The current virtual environment reports Python 3.12.13, Streamlit 1.59.1 and Requests 2.34.2.
- The visible repository files are untracked and there is no existing commit history to preserve in the current Git checkout.

### Planning assumptions

- Users will access the application through a normal web browser.
- Initial usage is fewer than 5–10 users per day, with low concurrency and long idle periods.
- AWS is preferred, but low cost and operational simplicity are more important than using a particular AWS product.
- Git-based development, review and deployment are desired.
- Future usage may grow from a handful of users to tens or hundreds per day.
- No high-availability, regulated-data, contractual uptime or multi-region requirement has yet been specified.
- The current application remains a catalogue and comparison tool rather than becoming a data-processing platform at launch.
- The MIM service remains externally hosted and the application needs read-only access to it.

These assumptions must be revisited before a public launch. They do not justify avoiding the decisions that can already be made from the repository.

## 3. Current Architecture

### Current Architecture

The application is a Streamlit monolith with a useful separation of domain, API and presentation modules inside the same process:

- app.py is the top-level Streamlit entry point and orchestration layer.
- components.py contains the visual system, cards, comparison UI and HTML/CSS rendering.
- models.py defines typed dataclasses for Product and Profile.
- catalogue.py loads and validates local JSON data.
- matching.py performs deterministic criterion evaluation and grouping.
- mims_api.py discovers the authenticated MIM API schema, loads products and instruments, joins them by stable instrument ID and converts them to Product records.
- fedeo_api.py, fedeo_normalisation.py, fedeo_matching.py, fedeo_discovery.py and fedeo_ui.py implement an optional metadata sidecar without mutating the curated catalogue.
- data/ contains the offline catalogue and profiles.
- assets/agency_logos/ contains local identity assets and a manifest.
- tools/populate_ceos_ard.py regenerates researched catalogue and report artifacts.
- tests/ contains unit and application-behaviour tests.

The application has no application-owned backend service separate from the Streamlit process. Streamlit supplies the HTTP server, browser session and rerun model.

### ASCII architecture diagram

~~~text
Browser
   |
   | Streamlit browser session / reruns / widgets
   v
app.py
   |
   +--> st.session_state
   |      +--> filters
   |      +--> session-only custom profiles
   |      +--> comparison selection
   |      +--> loaded MIM records
   |
   +--> catalogue.py
   |      +--> data/ceos_ard_products.json
   |      +--> data/default_profiles.json
   |      +--> fallback demo/status JSON
   |
   +--> matching.py
   |      +--> Product / Profile models
   |
   +--> components.py
   |      +--> local logos and HTML/CSS
   |
   +--> optional mims_api.py
   |      +--> authenticated MIM docs/OpenAPI
   |      +--> products endpoint
   |      +--> instruments endpoint
   |
   +--> optional FedEO sidecar
          +--> https://fedeo.ceos.org/collections
          +--> collection detail requests
~~~

### Current Execution Flow

1. app.py imports Streamlit, loads .env values with load_dotenv(), sets the page configuration and injects the visual theme.
2. load_products() and load_profiles() in catalogue.py read local JSON files and construct typed dataclass objects.
3. init_state() establishes per-session defaults in st.session_state.
4. The app renders the Discover, Profile Builder and Compare tabs.
5. The user selects or edits a profile and refines metadata filters.
6. Local records are filtered by metadata_filter(), then scored and grouped by matching.group_and_sort().
7. If the MIM option is enabled and the user presses the load button, cached_mim_products() performs authenticated schema discovery and product/instrument loading. The returned records are cached with a six-hour st.cache_data TTL.
8. If the experimental FedEO option is enabled, up to 12 filtered records can be enriched and a bounded discovery search can be performed. These calls are also cached for six hours and failures leave the existing catalogue intact.
9. Product cards are rendered. Comparison IDs remain in the current Streamlit session and are capped at three products.
10. A process restart, session expiry or new instance removes session-only custom profiles, filters and comparisons. No business record is lost because none is persisted.

### Major Components

app.py is approximately 1,100 lines and contains both UI composition and significant orchestration/state logic. components.py is approximately 889 lines and contains the presentation layer. The API and matching code is more modular and has strong unit-test coverage relative to the prototype's scope.

### External Dependencies

| Dependency | Use | Failure behaviour |
| --- | --- | --- |
| Streamlit | Browser UI, server, session state, caching | Application cannot start without it |
| Requests | MIM and FedEO HTTP clients | MIM falls back to local catalogue; FedEO is isolated |
| python-dotenv | Local .env loading | Production should not rely on a repository-local .env |
| CEOS MIM API | Optional authenticated product/instrument records | User sees bundled catalogue and warning |
| FedEO | Optional collection metadata/discovery | Existing product records remain unchanged |
| Local JSON/CSV/PNG/SVG/ICO/WEBP assets | Catalogue, profiles, provenance and UI identity | Missing required JSON stops with a user-facing error |

### Current Strengths

- The existing Streamlit model already provides the intended browser experience.
- Local catalogue fallback means the application is useful without external services.
- Domain models, catalogue loading and matching are separated from UI rendering.
- MIM and FedEO integration have explicit failure isolation, bounded requests and user-facing fallback.
- MIM products are joined by stable instrument IDs rather than fuzzy names.
- FedEO values are kept as a display-only sidecar and protected fields are not overwritten.
- Dynamic values placed into raw HTML are generally escaped in components.py.
- The app does not write user data or temporary files during normal use.
- Tests cover matching, catalogue normalisation, MIM normalisation, FedEO behaviour, profiles, terminology and agency assets.

### Architectural Constraints

- Streamlit reruns the script on interaction; code must remain compatible with that lifecycle.
- st.session_state is per user session, not durable storage.
- st.cache_data is process/instance-local and is not a shared distributed cache.
- MIM calls are synchronous and can involve docs, OpenAPI, products and instruments requests before the UI can show the loaded records.
- FedEO enrichment can make several synchronous external calls in one user interaction.
- The UI, state initialisation and application orchestration are concentrated in app.py.
- The current deployment contract is Windows-oriented (run_app.bat) and does not define a Linux production command.
- The current code has no explicit health route, structured logging configuration, authentication boundary or production rollback mechanism.

## 4. Current Execution Flow

The normal local execution path is documented in README.md and run_app.bat: create or reuse .venv, install requirements.txt when a snapshot changes, then execute streamlit run app.py. The launcher is useful for a developer workstation but is not a production process supervisor.

The local catalogue path is deliberately simple. catalogue.py resolves the repository root from __file__, reads data/ceos_ard_products.json, and constructs Product instances. It only uses the older demo/status files as a fallback if the researched catalogue is absent. The production deployment should therefore ship the required data/ files with the application release.

MIM loading is not performed at application startup. When enabled, mims_api.py reads the MIM API documentation, discovers the declared schema URL, inspects paths, loads the product and instrument collections, and joins them in memory. The adapter has request timeouts and retries, but it is still a synchronous user-triggered path. This is acceptable for very low usage if the UI sets realistic timeout expectations; it becomes a latency and reliability concern if many users refresh at once.

FedEO is even more clearly an optional sidecar. fedeo_api.py permits only official HTTPS same-host next links, uses bounded search requests and retries limited server/rate responses. fedeo_matching.py requires strong corroborating evidence before attaching a collection to a product. This is a good safety boundary, but the calls should remain off by default for the first hosted pilot unless the feature is specifically needed.

## 5. Key Findings

### Critical

- The current .env contains MIM configuration/credential material locally. It is ignored by .gitignore, but the repository is currently entirely untracked, so an initial git add . would be a realistic accidental-secret exposure point.
- The public/private access decision is unresolved. If MIM loading is available to unauthenticated users, a public site can cause repeated use of the server-held MIM credential and external API quota.
- There is no production secret injection or explicit rule preventing load_dotenv() from loading a server-local file.
- There is no defined production process, port, health check, TLS boundary or rollback procedure.
- There is no Git history or baseline commit in the inspected checkout.

### High Priority

- The dependency specification is not reproducible: requirements.txt uses ranges and there is no lock or constraints file.
- The app is a long-running Streamlit process, so S3/CloudFront-only and Lambda/API Gateway designs are not direct fits.
- The app relies on in-memory session state and six-hour per-process caches. This is safe for a single instance with session-only requirements but must be documented before horizontal scaling.
- app.py is a large top-level script that mixes UI rendering, state management and integration orchestration.
- The current .streamlit/config.toml is not a production configuration: headless = false and runOnSave = true.
- No automated CI or deployment pipeline exists.

### Medium Priority

- The MIM adapter makes multiple synchronous external requests and dynamically discovers endpoints at runtime; it is robustly guarded but should receive a startup smoke test and clearer operational telemetry.
- There is no dedicated lightweight application health check or dependency health distinction.
- Reports and output assets are mixed into the repository boundary without a clear generated-artifact policy.
- The Windows launcher is useful locally but is not portable as a deployment definition.
- There is no browser-level test for the real hosted Streamlit interaction path.

### Low Priority

- The UI could eventually be split into smaller modules for maintainability.
- An ecosystem-native project file such as pyproject.toml could replace the minimal requirements-only model later.
- The legacy wildcard entry point in product_selection_framework.py could be retired once callers are confirmed.
- Current visual HTML/CSS implementation should not be replaced merely for stylistic modernisation.

## 6. Website Readiness

### Web Hosting Readiness

The application is web-capable now because Streamlit is already a web server and browser UI framework. The smallest change is to retain Streamlit and provide a Linux process, TLS endpoint, deployment method and environment configuration.

A separate frontend/backend split is not required at launch. A split would duplicate the existing UI work and require a new API contract without solving a present requirement. It becomes reasonable only if a durable public API, mobile client, background processing, or independent frontend deployment becomes a real product need.

### Blocking Issues

The following must be resolved before exposing the application as a production website:

- production command must bind to the host/port supplied by the hosting environment;
- local development settings must not control production behaviour;
- MIM credentials must be injected from a protected source;
- HTTPS and ingress restrictions must be configured;
- the public/private access model must be selected;
- a smoke test, rollback method and owner for the service must exist;
- logs must be available without leaking credentials or raw secret-bearing payloads.

### Changes Required for Website Operation

- Use a Linux startup command equivalent to streamlit run app.py --server.headless true --server.address 127.0.0.1 --server.port 8501 behind a local reverse proxy, or bind to 0.0.0.0 and the platform-provided port when a managed platform requires it.
- Run under systemd, Supervisor or the selected managed service rather than an interactive shell.
- Set headless = true and runOnSave = false in the production configuration or override both through the process command.
- Configure the reverse proxy for HTTPS, WebSocket upgrade, request timeouts and a bounded request body.
- Add a simple health check that verifies the process is alive without making MIM or FedEO calls.
- Ensure the working directory and release directory contain the data/assets files resolved by Path(__file__).

### Changes Required for Multi-User Operation

At the expected launch scale, a single instance can support multiple low-concurrency browser sessions. The current session-only state should remain session-only. Before adding replicas:

- do not treat session state as an account or permanent record;
- do not assume an in-process cache is shared between instances;
- measure MIM/FedEO request latency and rate behaviour under overlapping sessions;
- decide whether a user must be able to resume state after restart;
- if durable profiles or comparisons are required, introduce an explicit persistence model.

### Existing Components That Can Be Retained

Retain Streamlit, Product/Profile, catalogue.py, matching.py, the local catalogue, the MIM adapter, the bounded FedEO sidecar, the local assets and the existing tests. A hosting uplift does not require a frontend rewrite, database, or microservice split.

## 7. Recommended Architecture for Launch (<10 Users/Day)

### Recommended launch components

- One 1 GB Linux Amazon Lightsail instance, initially in the AWS region closest to the users and external services.
- One reverse proxy such as Caddy or Nginx on the same instance.
- One Streamlit process managed by systemd.
- The repository release, local catalogue and static assets on the instance's application filesystem.
- An HTTPS DNS name only if a custom domain is required; otherwise use the provider endpoint temporarily for a private pilot.
- Protected deployment-time secret injection for MIMS_API_USERNAME, MIMS_API_PASSWORD and the known MIM base URL.
- GitHub Actions or another Git-based runner for tests and controlled deployment after the first manual deployment.

No database, S3 bucket, CloudFront distribution, ALB, NAT Gateway, ECS service, ECR repository, Redis cache or VPC redesign is required at launch.

### Launch diagram

~~~text
                         Browser
                            |
                       HTTPS 443
                            |
                   Lightsail firewall
                            |
                  Caddy or Nginx + TLS
                            |
                 localhost:8501 / Streamlit
                            |
       +--------------------+--------------------+
       |                    |                    |
       v                    v                    v
  Local JSON/data     Optional MIM API       Optional FedEO
  and local assets    via server secrets     public metadata
       |                    |                    |
       +--------------------+--------------------+
                            |
                   session-only state
                 (no persistent user data)

Git provider --> CI tests --> controlled deploy --> Lightsail release
                         |
                         +--> protected secret injection
~~~

The deployment should run the Streamlit application as a non-root service account. Only the reverse proxy should listen on public ports. The application's direct port should be firewalled from the internet.

## 8. Why This Architecture Is Recommended

Lightsail is recommended because the current workload is a small always-on browser application, not a bursty function or static bundle. The existing code can run with a process command and environment changes rather than a platform rewrite. A single small instance has enough capacity for the current 26-record local catalogue and expected low concurrency, while keeping fixed cost and service count understandable.

This choice trades automatic infrastructure scaling for low launch cost and operational simplicity. That trade is appropriate because:

- there is no database or file store to make highly available;
- there are no long-running jobs or high-volume uploads;
- the local data set is small and read-only during normal application use;
- session-only state does not need to survive a restart;
- external API calls are optional and already failure-isolated;
- expected usage does not justify an ALB, NAT Gateway, or multi-task service.

More complex alternatives are rejected for concrete reasons:

- Lambda/API Gateway would require replacing the Streamlit server interaction model with an API and likely a new frontend.
- S3/CloudFront or Amplify can host static files but cannot host the current Streamlit execution model directly.
- ECS/Fargate introduces container packaging, task networking, a load balancer and a higher fixed-cost baseline before there is a real scaling need.
- RDS, DynamoDB and Redis have no current data requirement to satisfy.
- Kubernetes/EKS, service meshes and multi-region deployment are disproportionate to a few users per day.
- App Runner is not a sound new-account choice because AWS currently states that it is closed to new customers and recommends ECS Express Mode for migration.

## 9. AWS Hosting Options Considered

| Option | Fit | Idle Cost | Low-Usage Cost | Code Changes | Complexity | Scaling | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lightsail Linux instance + Streamlit | High | Fixed small monthly instance cost | Low and predictable | Low; startup, TLS and config only | Low to medium | Vertical first; migrate later | Recommended launch |
| EC2 Graviton instance + Streamlit | High | Low fixed compute/storage/IP cost | Low | Low; similar process setup | Medium | More control; can move to ASG/ECS | Good alternative if IAM/automation matters |
| ECS Express Mode / ECS Fargate + ALB | Medium for future, low for launch | Task plus ALB/networking baseline | Higher fixed cost than needed | Container boundary and deployment changes | Medium to high | Strong | Revisit at growth |
| Lambda + API Gateway + new frontend | Low for current code | Very low compute idle | Low if fully redesigned | High; substantial rewrite | High during migration | Strong | Do not use for launch |
| S3 + CloudFront or Amplify static hosting | Low | Low storage/distribution baseline | Low | High; Streamlit must be replaced or fronted by another service | Medium to high | Strong for static content only | Not a current application host |

### App Runner note

AWS App Runner would otherwise have been a plausible Streamlit host because it accepts source or container deployments and manages scaling. AWS's current availability notice states that App Runner is closed to new customers and recommends ECS Express Mode for migration. It is therefore excluded from the launch recommendation rather than treated as a dependable option for a new deployment.

### Option 1 — Lightsail Linux instance

Use a 1 GB Linux plan, reverse proxy and systemd. Keep all runtime state ephemeral and session-only. Deploy application releases from Git after CI passes. The main costs are the instance, optional domain/DNS, and any transfer overages. The main operational responsibility is OS patching and process maintenance.

### Option 2 — EC2 Graviton instance

Use a small Graviton EC2 instance with an IAM instance role, SSM access, a reverse proxy and systemd. This is technically more flexible and better suited to secure remote management and CloudWatch integration than Lightsail, but requires more VPC, security group, EBS, patching and instance lifecycle decisions. It is the preferred alternative if the team already operates EC2 or wants SSM/OIDC deployment controls from the start.

### Option 3 — ECS Express Mode / ECS Fargate

Containerise the app, store an image in ECR, and let ECS Express Mode create the Fargate service, ALB, health checks and networking. This gives a sensible future path for replicas and managed deployments. It is not proportionate to the launch traffic because the ALB and minimum task/networking footprint create fixed cost and more moving parts.

### Option 4 — Lambda/API Gateway

Lambda has attractive usage-based economics, but the current application is not a Lambda-shaped handler. It relies on Streamlit's server, rerun lifecycle, widgets, browser session and potentially long synchronous external calls. Making Lambda suitable would mean building a backend API and a separate browser frontend or a different UI framework. This is a product redesign, not an uplift.

### Recommended Architecture for Launch (<10 users/day)

Use Option 1. Keep Option 2 as the alternative if secure fleet management or existing EC2 expertise outweighs Lightsail simplicity.

### Likely Next Architecture if Usage Grows

Move to Option 3 when any of the following becomes true: sustained concurrent sessions, repeated process saturation, required rolling deployments without downtime, need for more than one application instance, or a business requirement for managed task replacement. Preserve the Streamlit UI and domain modules, then add a container boundary and deployment health checks. Do not add a database solely because compute moved to ECS.

## 10. AWS Services Required at Launch

| AWS Service | Purpose | Why Required | Cost Consideration | Alternative |
| --- | --- | --- | --- | --- |
| Amazon Lightsail | Small always-on Linux host | Runs the existing Streamlit process without a rewrite | Fixed monthly bundle; current published 1 GB public-IPv4 example is about USD 7/month, region-dependent | EC2 |
| Optional Lightsail DNS/static IP | Stable hostname or custom domain routing | Needed only when the pilot requires a custom stable domain | Small or separate charge depending on resource | External DNS provider |
| AWS Systems Manager Parameter Store, optional | Store MIM credentials as SecureString for deployment retrieval | Useful if the deployment runner already has tightly scoped IAM/OIDC access | Standard parameters are generally the low-cost choice; KMS and advanced features must be checked | GitHub Environment secrets for a small private pilot |
| CloudWatch, optional initially | Logs, metrics and alarms | Valuable once the service is public or owned by more than one person | Usage-based ingestion/storage/alarms; keep retention short | Journald plus external uptime check during private pilot |

The minimum actual AWS runtime dependency is Lightsail. The application itself does not call AWS APIs and does not currently require an AWS database or object store.

## 11. AWS Services We Do NOT Need Yet

| Service or component | Why not now | When it may become justified |
| --- | --- | --- |
| RDS/Aurora | No persistent relational records or queries exist | Durable accounts, audit records, complex relationships or transactional workflows |
| DynamoDB | No key-value persistence requirement exists | Durable profiles, user preferences, job state or simple application records |
| S3 | No uploads or generated files are stored by the app | User uploads, generated reports, durable exports, release artifacts or cross-instance files |
| ECS/Fargate | A single small process is enough at launch | Multiple instances, managed rolling releases or sustained concurrency |
| EKS/Kubernetes | No scale or team boundary justifies it | Extraordinary organisational/platform requirements; not expected in the near term |
| Application Load Balancer | One instance does not need load balancing | ECS/EC2 replicas, managed TLS at the edge or multi-target deployments |
| NAT Gateway | The launch host can use its direct outbound path | Private-subnet architecture with private workloads that need outbound internet |
| ElastiCache/Redis | In-process caching is enough at this scale | Shared cache across replicas or expensive external API results at higher usage |
| SQS/EventBridge | No background jobs or queueable work exists | Long-running MIM/FedEO refreshes, scheduled ingestion or asynchronous processing |
| EFS | No shared filesystem is required | Shared durable files across multiple compute instances |
| CloudFront | The app is dynamic and traffic is tiny | Static assets, global audience, edge caching or a separate static frontend |
| Secrets Manager | It has useful features but a monthly per-secret cost is unnecessary for a tiny pilot | Rotation, multi-service consumption, audit requirements or platform-native secret references |

## 12. Cost Considerations

### Idle Costs

Lightsail has a predictable fixed cost while the instance exists, even if nobody uses the site. Current AWS documentation lists Linux public-IPv4 bundles from approximately USD 5 for 0.5 GB and USD 7 for 1 GB, before region/tax differences. The 1 GB plan is the safer starting point because Streamlit, Python, cached data and the reverse proxy share memory.

App Runner, where available to existing customers, charges for provisioned memory while idle and adds active compute during requests; it is also unavailable to new customers according to AWS's current availability notice. ECS/Fargate plus an ALB would add a task baseline and ALB/networking costs. Those fixed costs are disproportionate at the current traffic level.

### Expected Costs at Very Low Usage

For the recommended launch:

- the Lightsail bundle dominates the bill;
- local catalogue reads and session state do not create separate AWS usage charges;
- MIM and FedEO calls are outbound requests to external services rather than AWS service calls;
- ordinary low-volume browser traffic should remain inside the bundled transfer allowance;
- optional DNS, snapshots, monitoring and a custom domain add small but non-zero costs.

No precise Australian-dollar estimate is included because region, tax, IPv4 treatment, transfer, currency and account credits are not known.

### Likely Main Cost Drivers

1. Always-on compute bundle.
2. Data transfer if the application later serves large files or many images.
3. Optional CloudWatch log ingestion and retention.
4. Domain/DNS and backup/snapshot services.
5. If the architecture later moves to ECS, ALB and network components rather than application requests.

### Costs That Scale With Usage

External API rate limits and possible provider charges are outside this repository. On AWS, future S3 storage/request/transfer costs would scale with persisted files; Lambda would scale with invocations and duration; Fargate would scale with task hours; CloudWatch would scale with logs/metrics. At the present scale, avoiding fixed infrastructure is more valuable than optimising request-level compute.

### Fixed Costs to Avoid

Avoid NAT Gateways, always-on ALBs, RDS instances, multiple Fargate tasks, multi-region resources, paid observability platforms and per-service secret products until a concrete requirement exists.

### Pricing references

- [AWS Lightsail instance bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- [AWS Lightsail FAQ and container pricing](https://aws.amazon.com/lightsail/faq/)
- [AWS App Runner pricing](https://aws.amazon.com/apprunner/pricing/)
- [AWS App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)

Prices should be rechecked before provisioning.

## 13. Likely Next Architecture if Usage Grows

### Trigger conditions

Migration should be driven by observed signals, not a user-count target alone:

- more than one instance is needed for availability or deployment safety;
- sustained concurrent Streamlit sessions cause memory/CPU saturation;
- request latency becomes unacceptable because MIM/FedEO calls overlap;
- service restarts lose user work that now matters;
- external API calls need a shared cache or scheduled refresh;
- user accounts, saved profiles, uploads or generated outputs become product requirements;
- the single host becomes difficult to patch or deploy without downtime.

### Evolution path

~~~text
Single Lightsail instance
  Streamlit + reverse proxy + local read-only catalogue
             |
             | sustained concurrency, availability, or deployment need
             v
ECS Express Mode or ECS/Fargate
  Streamlit container + ALB + health checks
  one task first, then controlled replicas
             |
             | durable users/files/jobs or materially larger load
             v
ECS/Fargate + S3 + DynamoDB/RDS only if required
  optional queue and worker path
  shared cache only if measurements justify it
~~~

### Components that can be preserved

- Product and Profile models.
- Catalogue files and matching rules.
- Most of components.py.
- MIM and FedEO normalisation/matching logic.
- The Streamlit UI and browser workflow.
- Existing unit tests and test fixtures.

### Components that change

- Startup packaging becomes a Docker container or managed runtime contract.
- Secrets move to task secret references or a deployment role.
- Logs move to a central service.
- Persistent user/file state, if introduced, moves out of the local filesystem and st.session_state.
- In-process cache assumptions must be removed or made explicitly instance-local.

## 14. Proposed Repository Structure

The current repository is usable, so this is a target structure rather than a request to reorganise everything immediately.

~~~text
project/
├── app.py                         # Streamlit entry point
├── catalogue.py                   # Local catalogue loading/validation
├── models.py                      # Product/Profile domain models
├── matching.py                    # Selection and grouping logic
├── components.py                  # Shared UI components; split later if useful
├── mims_api.py                    # Authenticated MIM adapter
├── fedeo_api.py                   # Optional FedEO HTTP client
├── fedeo_discovery.py             # Bounded discovery
├── fedeo_matching.py              # Conservative matching
├── fedeo_normalisation.py         # Provider-tolerant normalisation
├── fedeo_ui.py                    # FedEO presentation
├── data/                          # Versioned runtime catalogue/profile data
├── assets/                        # Versioned runtime UI assets
├── tests/                         # Unit and component-behaviour tests
├── tools/                         # Explicit data-generation/maintenance tools
├── reports/                       # Reviewed provenance/design docs only
├── docs/                          # Architecture and operational documentation
├── output/                        # Local generated output; normally ignored
├── tmp/                           # Local scratch space; ignored
├── .github/workflows/             # CI/deployment later
├── .env.example                   # Names and safe placeholders only
├── .gitignore
├── README.md
├── requirements.txt               # Pinned direct runtime dependencies
└── product_selection_framework.py # Retain only while legacy callers need it
~~~

Do not create all proposed folders merely to match the tree. output/, tmp/ and .github/workflows/ should be added only when their workflows are actually introduced. The important boundary is that runtime source/data/assets are distinguishable from generated review artifacts and local scratch files.

## 15. Git Readiness

### Current issues

- The inspected checkout has no existing commit history and the project files appear untracked.
- .gitignore excludes .env, .venv, bytecode, pytest cache and Streamlit secrets, but not output/, tmp/, generated reports, local logs or other common artifacts.
- Generated PDFs, screenshots and UI comparison images are present under output/.
- The tools/populate_ceos_ard.py script writes catalogue data, CSV provenance and Markdown reports.
- Large binary assets exist, including PDFs and PNGs.
- A local .env exists. Its values were not displayed during review.
- The repository has a useful README but no contribution, deployment, rollback or security policy.

### Files that should be version controlled

- Python application modules.
- tests/.
- requirements.txt and the eventual lock/constraints file.
- .env.example with placeholders only.
- .gitignore.
- README.md and practical architecture/operations documentation.
- data/ceos_ard_products.json, data/default_profiles.json, data/ceos_ard_status.json and data/demo_products.json because the application consumes them.
- data/ceos_ard_research_log.csv if it is treated as provenance/audit evidence and reviewed as part of catalogue changes.
- Required local UI assets and their manifest.
- Deliberately maintained reports such as reports/fedeo_integration.md.

### Files that should not be version controlled by default

- .env, .venv/, __pycache__/, .pytest_cache/.
- .streamlit/secrets.toml.
- output/ PDFs, screenshots and comparison exports unless a specific artifact is intentionally published.
- tmp/ and local scratch files.
- Machine-specific logs and caches.
- Generated CSV/Markdown reports under reports/ when they are reproducible build output rather than reviewed source documentation.
- Credentials, private keys, deployment bundles and copied production environment files.

### .gitignore requirements

Extend the existing file to cover output/, tmp/, local logs, coverage output, platform files and generated artifacts. Do not blindly ignore the entire data/ or reports/ directory because some of those files are runtime data or maintained evidence.

### Secret / Credential Concerns

The local .env contains MIM username/password variables. The current code reads them from the environment and the README says credentials are not displayed. That is good application behaviour, but the first Git staging operation is the highest immediate risk because every file is currently untracked. Confirm git check-ignore .env before staging and use a staged-file secret scanner.

If the MIM credential has ever been pasted into chat, committed, uploaded, or shared, treat it as exposed and rotate it through the MIM service administrator. The actual value is intentionally not reproduced here.

## 16. Recommended Git Strategy

For a small project, use a lightweight protected-main workflow:

1. main is the deployable branch.
2. Work occurs on short-lived feature or fix branches.
3. Pull requests run tests and a secret scan.
4. At least one human review is required for changes involving secrets, deployment, data-generation logic or public-facing behaviour.
5. Merge to main triggers deployment only after CI passes and a production environment approval.
6. Releases are identified by commit SHA or a simple date/version tag.
7. Keep the previous successful release available for rollback.

Branch protection should require passing checks and prevent direct force pushes to main. Do not introduce a large release-management process or a multi-environment matrix before the project has a second maintainer or a real staging requirement.

Generated files should have an explicit owner and policy. A catalogue-generation change should review both the source declaration in tools/populate_ceos_ard.py and the resulting versioned data/provenance files.

## 17. CI/CD Architecture

### Recommended process

~~~text
Developer
    |
    v
Feature branch
    |
    v
Pull request
    |
    v
CI: dependency install, unit tests, import/startup smoke test,
    secret scan, basic lint/type checks when adopted
    |
    v
Merge to main
    |
    v
Production approval
    |
    v
Build release bundle from the commit
    |
    v
Deploy to Lightsail and restart service
    |
    v
HTTP/HTTPS smoke test and rollback if failed
~~~

### CI platform

GitHub Actions is a reasonable default because the requested workflow is Git-based and the project has no current CI system. The first workflow should be intentionally small: install the supported Python version, install pinned dependencies, run python -m unittest discover -s tests -v, import the catalogue, and run a startup smoke test that does not call external APIs.

### AWS authentication

Prefer GitHub Actions OIDC to assume a narrowly scoped AWS IAM role rather than storing long-lived AWS access keys. The role should be allowed only to the resources needed by the deployment. If the first Lightsail deployment uses SSH, keep the SSH deploy key in a protected GitHub Environment and restrict the host firewall; plan an SSM or EC2 migration if the workflow becomes operationally important.

### Deployment

Build a release from the exact commit, transfer only required source/data/assets/dependency files, install into a versioned release directory, update a current symlink, validate the process, then restart or switch the service. Do not copy .env, .venv, output/, tmp/ or arbitrary developer files.

### Rollback

Keep the previous release directory. If the smoke test fails, switch the current symlink back and restart. A rollback must not delete the previous working release or overwrite the protected environment file.

## 18. Configuration and Secrets

### Local Development

Continue to use .env for developer-only MIM credentials, with .env.example documenting names, safe placeholders and non-secret defaults. Do not put real credentials in Streamlit secrets, README examples, tests or shell history.

Consider making dotenv loading explicitly local-only in a later implementation. Production should inject environment variables or an environment file outside the repository and run with a working directory that contains no .env.

### Git Repository

Commit .env.example, not .env. Commit the public MIM base URL only if it is genuinely non-secret and expected to be stable; otherwise retain it as a documented environment variable. Commit feature flags such as ENABLE_FEDEO_INTEGRATION only as defaults, not as hidden operational controls.

### Environment Variables

At minimum, separate:

- MIMS_API_BASE_URL
- MIMS_API_USERNAME
- MIMS_API_PASSWORD
- ENABLE_FEDEO_INTEGRATION
- STREAMLIT_SERVER_HEADLESS
- STREAMLIT_SERVER_PORT
- optional environment name and release identifier for logs

Do not use a single production .env file as an artifact checked into a deployment bundle.

### AWS Production

For the recommended Lightsail launch, use either:

1. AWS Systems Manager Parameter Store SecureString values retrieved by a tightly scoped deployment identity and written to a root-owned, mode-600 environment file on the instance; or
2. protected GitHub Environment secrets injected during deployment for the smallest private pilot.

The application does not currently call AWS APIs, so it should not receive broad AWS permissions merely to read a secret at runtime. If runtime IAM-based secret retrieval becomes important, EC2 with an instance role or ECS task secrets is a better fit than adding an AWS SDK solely to the Lightsail application.

### API Keys and Credentials

Sensitive information that must never be committed:

- MIM username/password;
- AWS access keys, session tokens and private keys;
- GitHub deploy keys;
- TLS private keys;
- any future database, S3 or third-party API credentials;
- copied production environment files.

Log only credential configuration status, not values. Do not include raw MIM responses in logs unless their sensitivity is understood.

### AWS IAM

Use separate identities for human administration and deployment. Scope deployment permissions to the named resource. Use OIDC for GitHub Actions where available, short-lived sessions, no wildcard administrative role, and a production approval gate.

## 19. Dependency Management

### Current state

requirements.txt contains three direct dependencies with broad compatible ranges:

- streamlit>=1.41,<2
- requests>=2.32,<3
- python-dotenv>=1.0,<2

run_app.bat uses Python 3.11 when available but falls back to another Python executable. The README says Python 3.11 or newer. The current virtual environment is Python 3.12.13.

### Reproducibility problems

- Transitive dependencies can change between deployments.
- The tested Streamlit/Requests versions are not recorded in the repository.
- Python has no upper bound or CI-defined support matrix.
- The local launcher installs the newest permitted versions whenever its snapshot changes.
- There is no separate dependency set for tests or deployment.

### Recommended approach

Keep the existing requirements-based ecosystem initially to minimise disruption. Pin the tested direct versions and generate a constraints/lock artifact for transitive dependencies. Alternatively, adopt uv or a carefully managed pyproject.toml later, but do not change package tooling and hosting at the same time unless there is a clear benefit.

Define one primary supported Python version, preferably the version used by CI and production, and optionally test the next supported minor version. Confirm Streamlit and all dependencies against that version before launch.

### AWS runtime considerations

The runtime needs Python, Streamlit, Requests, python-dotenv, local JSON/assets and outbound HTTPS. No native system library or external executable is evident in the application modules. The reverse proxy and service manager are host dependencies, not Python dependencies.

## 20. Containerisation Decision

## Docker Recommendation

Optional, not recommended at launch.

Docker would make the future ECS/Fargate migration repeatable, but it is not needed to run one small Lightsail instance. Introducing Docker now adds image build, registry, image scanning, container logging, port and filesystem decisions while the current application has no container-specific need.

### Benefits later

- repeatable runtime boundary;
- easier migration to ECS/Fargate;
- consistent CI build and deployment;
- clear separation of build and runtime dependencies.

### Costs now

- Dockerfile and image maintenance;
- ECR or another registry;
- more deployment credentials and cleanup;
- additional debugging layer;
- no material benefit for current traffic if the host runs one process.

### Future container boundary

~~~text
Container
├── app.py and Python modules
├── pinned Python runtime
├── requirements and local read-only catalogue/assets
└── Streamlit startup command

Outside container
├── Secrets       -> task/deployment secret injection
├── Persistent files -> S3 if a future feature requires them
├── Logs          -> CloudWatch or platform logging
└── Durable state -> DynamoDB/RDS only if the product requires it
~~~

## 21. Data and Persistence

| Data | Current Location | Needs Persistence? | Recommended Location |
| --- | --- | --- | --- |
| Application source | Repository | Yes | Git |
| Curated product catalogue | data/ceos_ard_products.json | Yes | Git at launch; S3 or a data pipeline only if catalogue updates outgrow Git |
| Default profiles | data/default_profiles.json | Yes | Git |
| Demo/status fallback data | data/demo_products.json, data/ceos_ard_status.json | Yes while fallback exists | Git |
| Research provenance | data/ceos_ard_research_log.csv | Usually yes for auditability | Git if reviewed; otherwise generated release artifact |
| Local UI assets | assets/ | Yes | Git or a later static asset store |
| Custom profiles | st.session_state | No under current product promise | Keep session-only; use DynamoDB/RDS only if users must save them |
| Filters/comparison selections | st.session_state | No | Keep session-only |
| MIM API cache | Streamlit process cache | No | Keep in-process at launch; externalise only if cost/latency requires it |
| FedEO cache | Streamlit process cache | No | Keep bounded and in-process |
| Uploads | None | Not applicable now | S3 if introduced |
| Generated reports/downloads | None in application UI; external links only | Not applicable now | S3 if introduced |
| Logs | Process/host logs | Operational persistence | Journald initially; CloudWatch when public/owned operationally |
| Credentials | Local .env during development | Yes, but secret | Parameter Store/secret injection; never Git |
| Runtime temporary files | None observed | No | Ephemeral host storage only |

### Risks checked

- No fixed output filenames or shared application working directory were found in the runtime app.
- tools/ writes generated files, but those tools are not part of normal hosted request handling.
- No user upload, file generation, or application-owned file mutation currently creates collision risk.
- The main state risk is not file corruption; it is loss of session state on restart and non-shared caches after horizontal scaling.
- Raw MIM payloads are retained inside Product.raw_source in memory. Keep that field out of logs and bound cache lifetime.

S3 alone would be sufficient for future generated files if the product never needs relational queries. Do not add a database pre-emptively.

## 22. Multi-User and Concurrency Considerations

### Current Single-User Assumptions

- st.session_state stores custom profiles, filters, selected comparisons and loaded API records for one browser session.
- The Profile Builder explicitly tells users that profiles are kept for the browser session.
- The comparison view caps selection at three records in session state.
- API data loading is initiated by a user and stored in that session, although the six-hour st.cache_data result is process-level.

### Multi-User Failure Risks

Two users on the same single process should receive separate Streamlit sessions, so their custom profiles and comparison selections should not be mixed. However:

- both users may share the same cached MIM/FedEO results;
- two users can trigger external API loading close together;
- process restart loses both users' session state;
- moving to multiple instances creates separate caches and increases external API calls;
- a deployment replacement can disconnect all active sessions.

### Concurrency Risks

- MIM schema/product/instrument loading is synchronous.
- FedEO enrichment can issue multiple sequential external lookups.
- Streamlit reruns the whole script on widget interaction, so expensive work must remain behind buttons and cache decorators.
- A public unauthenticated user can repeatedly request optional API paths and consume outbound quota.
- No queue, rate limiter, request budget or circuit breaker exists at the application edge.

### State Management Recommendations

At launch, retain session state and make its non-durable nature explicit. Add simple ingress rate protection and keep external API features opt-in. If the app becomes public, add authentication or a controlled access boundary before enabling MIM for arbitrary users.

Before adding replicas, decide whether session affinity is acceptable. It is not a substitute for durable state; it only reduces the chance that a WebSocket session moves between instances. If user work must survive restarts, persist it explicitly.

## 23. Authentication Recommendation

### Is Authentication Required at Launch?

It depends on the unresolved public/private decision:

- For a private pilot or internal catalogue, yes: protect the site with a small access boundary before making the MIM feature available.
- For a public read-only demo using only the bundled catalogue, application authentication is not strictly required, provided the MIM/FedEO features are disabled or rate-protected and the data is approved for public display.
- For a public site with MIM access, do not rely on the MIM credentials as the user's access control. The server-side credential is a shared privileged integration secret.

### Recommended Launch Approach

For a private pilot, use reverse-proxy Basic Auth or an equivalent simple access gate, with credentials stored outside Git and rotated. Restrict SSH/admin access separately. This is proportionate for fewer than 10 users per day and avoids adding a full identity platform before the audience is known.

For a genuinely public catalogue, disable or gate the authenticated MIM option until there is a deliberate quota and abuse-control design.

### Future Authentication Approach

If users need individual accounts, saved profiles, access roles or audit trails, use a managed identity service such as Amazon Cognito or an existing organisational identity provider, then store durable profile records separately. Do not build password storage into Streamlit session state.

### Trigger for Increasing Authentication Complexity

Increase complexity when the site has multiple user groups, private data, saved user work, administrative actions, contractual access requirements, or observable abuse. Do not add Cognito merely because the application is hosted on AWS.

## 24. Security Findings

| Severity | Issue | Location | Recommendation |
| --- | --- | --- | --- |
| Critical | Local MIM credential file could be staged during first Git commit | .env, .gitignore, untracked checkout | Verify ignore rules, stage selectively, scan staged content, rotate if previously exposed |
| High | Production uses dotenv loading without an explicit production boundary | app.py:42 | Inject environment from the host/deployer and ensure no production .env is present |
| High | No public/private access decision | Application-wide | Protect private pilots; gate MIM for public use; document data approval |
| High | No HTTPS/reverse-proxy/security-group design | Deployment absent | Terminate TLS, restrict direct Streamlit port, restrict SSH/admin access |
| High | No CI secret scan or branch protection | Git/CI absent | Add protected main, PR checks and secret scanning before remote sharing |
| Medium | Optional external API calls can be triggered by users | app.py:689-729, app.py:795-842 | Rate-limit or authenticate public access; retain bounded caches and timeouts |
| Medium | External URLs are rendered as user-facing links | components.py:780-790, FedEO UI | Validate/allow-list source URLs where data becomes user-controlled; keep HTTPS preference |
| Medium | Raw API payloads are retained in memory | mims_api.py:341, models.py:82 | Do not log raw payloads; bound cache and remove fields not needed by UI if sensitivity increases |
| Low | Raw HTML is used for custom UI | components.py | Continue escaping dynamic values; add a security regression test if data sources broaden |
| Low | Local debug-oriented Streamlit settings are present | .streamlit/config.toml | Override for production: headless mode, runOnSave off, controlled port |

No secret value is included in this document.

## 25. Testing Strategy

### Tests Needed Before Hosting

- Keep the current 83 tests passing.
- Add a startup/import smoke test that loads the local catalogue without external credentials.
- Add a test that confirms missing MIM credentials do not prevent local catalogue startup.
- Add a test for production configuration not exposing the Streamlit port directly.
- Add a basic test for the chosen health-check path.
- Add a test that verifies the release bundle contains every required JSON and asset path.
- Add a secret-safety test or staged-file scanner in CI.

### Tests Needed Before Automated Deployment

- Install from the exact pinned/locked dependencies.
- Run all unit tests.
- Import app.py or execute a safe Streamlit smoke path without MIM/FedEO calls.
- Validate the production startup command in a disposable environment.
- Deploy to a non-public or protected target first.
- Perform an HTTP/HTTPS smoke test after deployment.
- Verify the MIM credential is available to the service but absent from logs and the release directory.
- Verify rollback to the previous release.

### Tests That Can Be Added Later

- Browser automation for the three-tab workflow.
- Concurrent-session smoke testing.
- External contract tests against a controlled MIM fixture or schema snapshot.
- Performance tests for MIM/FedEO latency and cache behaviour.
- Accessibility checks for the custom HTML/CSS.
- Recovery tests for process restart and host replacement.

Prioritise tests that prevent broken deployments, secret leakage, false data claims and external-service outages. Do not chase an arbitrary coverage percentage.

## 26. Logging and Monitoring

### Minimum Production Monitoring

- Service process status and restart count.
- HTTP/HTTPS reachability from an external check.
- Application startup failures.
- MIM request failure count and latency, without credentials.
- FedEO failure count and bounded lookup status.
- Memory usage and disk usage on the host.
- Deployment success/failure and commit identifier.

### Recommended Logging

Use standard Python logging with timestamps, severity, event name, release identifier and safe exception category. Log MIM/FedEO service status, timeout class and response status, not usernames/passwords or raw payloads. Avoid printing Streamlit widget values unless they are known to be non-sensitive.

### Health Checks

Use a lightweight process/HTTP health check that does not call MIM or FedEO. Treat external API availability as a separate dependency metric; the application is designed to remain usable with the bundled catalogue when those services fail.

### Alerts Worth Having

- service unreachable;
- repeated restart loop;
- sustained high memory or disk usage;
- deployment smoke test failure;
- MIM authentication failures;
- sustained external API failure;
- unexpected monthly AWS cost increase.

### Deployment Monitoring

Record the deployed commit SHA, release time, result of the post-deploy smoke test and rollback decision. Keep the last known-good release.

### Monitoring That Can Wait

Distributed tracing, full SLO dashboards, log analytics platforms, per-user analytics, multi-region synthetic monitoring and enterprise observability suites are unnecessary at launch.

CloudWatch is sufficient once central AWS visibility is wanted. For an initial private pilot, journald plus one external uptime check is acceptable if someone owns the service.

## 27. Code Maintainability

### Must Address Before Hosting

- Make the production startup contract explicit; do not deploy via run_app.bat.
- Separate production secret injection from local .env handling.
- Define the supported Python/dependency versions.
- Confirm the single intended entry point is app.py; do not deploy the wildcard-import legacy module as the entry point.
- Ensure optional external API calls cannot be used to expose or exhaust shared credentials on an uncontrolled public site.
- Add a safe smoke test and operational documentation.

### Should Address Soon

- Split configuration constants and external-service settings from the large top-level app.py orchestration path.
- Add a small health-check/operational status abstraction if the hosting platform requires it.
- Make cache scope and restart semantics explicit in documentation.
- Add browser-level smoke coverage for the core Discover/Profile Builder/Compare path.
- Replace broad except Exception around optional integrations with structured, observable error categories where practical; retaining failure isolation is correct.

### Worth Improving Later

- Break app.py into UI/state/orchestration modules.
- Break components.py into smaller presentation modules.
- Introduce type checking or a lightweight lint configuration.
- Replace wildcard import in product_selection_framework.py after confirming legacy consumers.
- Make MIM schema discovery a separately testable startup/data-refresh service if the API becomes central.

### Leave Alone

- The Streamlit framework.
- The local JSON catalogue.
- The typed models.
- Deterministic matching and conservative FedEO matching.
- Escaped custom HTML/CSS where it serves the current design.
- Session-only profiles while the product promise remains session-only.

## 28. Documentation Requirements

### Essential

- README local setup and supported Python version.
- Environment variable reference with secret/non-secret classification.
- Production startup command and port behaviour.
- Private/public access decision and authentication instructions.
- Deployment and rollback runbook.
- AWS resource inventory and owner.
- MIM/FedEO dependency and fallback behaviour.
- Data catalogue update procedure.
- Secret rotation procedure.

### Recommended

- One-page architecture diagram.
- CI check description.
- Troubleshooting guide for MIM failure, Streamlit restart and certificate issues.
- Data provenance and reviewed generated-file policy.
- Operational cost guardrails and budget alert instructions.

### Optional

- Contributor style guide.
- Detailed API field mapping reference, beyond the useful existing FedEO report.
- Performance tuning guide after real measurements.
- Public product documentation if the application becomes externally offered.

## 29. Migration / Uplift Roadmap

### Phase 0 — Immediate Safety and Repository Housekeeping

| Action | Classification |
| --- | --- |
| Verify .env is ignored and not staged; scan the intended first commit | Required |
| Rotate MIM credentials if they were ever exposed | Required if applicable |
| Decide private pilot versus public demo | Required |
| Define who owns the AWS account, domain, credentials and service | Required |
| Add ignore rules for output, tmp, logs and generated artifacts | Required |
| Review which reports/assets are source versus generated | Recommended |

### Phase 1 — Git and Project Structure

| Action | Classification |
| --- | --- |
| Create the initial commit containing only reviewed files | Required |
| Protect main and use pull requests | Recommended |
| Pin/lock dependencies and define Python support | Required |
| Document local setup, environment variables and data generation | Required |
| Add a basic secret scan and CI test workflow | Required |
| Retire or document the wildcard legacy entry point | Recommended |

### Phase 2 — Web Readiness

| Action | Classification |
| --- | --- |
| Confirm app starts using a production command and controlled port | Required |
| Set headless/runOnSave production behaviour | Required |
| Add process supervision and reverse proxy/TLS design | Required |
| Add health check and safe application logging | Required |
| Set external API timeouts, user-visible fallback and rate controls | Recommended |
| Add browser smoke testing | Recommended |

### Phase 3 — AWS Launch

| Action | Classification |
| --- | --- |
| Create one small Lightsail Linux instance | Required |
| Deploy application release and local data/assets | Required |
| Configure HTTPS and firewall rules | Required |
| Inject MIM secrets outside Git | Required if MIM is enabled |
| Protect private pilot or deliberately disable privileged integration for public demo | Required |
| Configure a DNS name if a custom domain is needed | Optional |

### Phase 4 — CI/CD

| Action | Classification |
| --- | --- |
| Run tests and smoke checks on every pull request | Required |
| Deploy only from protected main after approval | Recommended |
| Use OIDC/short-lived AWS credentials where supported | Recommended |
| Keep versioned releases and a tested rollback | Required |
| Add deployment status notification | Optional |

### Phase 5 — Production Hardening

| Action | Classification |
| --- | --- |
| Add uptime, memory, disk and restart monitoring | Required for public use |
| Add cost/budget alerts | Recommended |
| Establish patching and credential rotation schedule | Required |
| Review backup/snapshot and recovery procedure | Recommended |
| Add proper identity provider if individual accounts are needed | Optional until required |
| Move logs to CloudWatch if journald is insufficient | Recommended |

### Phase 6 — Growth / Scaling

| Action | Classification |
| --- | --- |
| Measure concurrency, latency and memory before changing compute architecture | Required |
| Containerise and move to ECS/Fargate only when triggers are met | Recommended |
| Move durable files to S3 if uploads/exports appear | Conditional |
| Add DynamoDB/RDS only when durable queryable records appear | Conditional |
| Add a queue/worker path for long-running refreshes | Conditional |
| Add shared cache only when repeated external calls justify it | Conditional |

## 30. Prioritised Recommendation Matrix

| Recommendation | Benefit | Complexity | Priority | Phase |
| --- | --- | --- | --- | --- |
| Protect/rotate MIM credentials before first commit | High | Low | Critical | 0 |
| Decide private/public access and gate MIM accordingly | High | Low | Critical | 0 |
| Create clean Git baseline and expand .gitignore | High | Low | Critical | 0–1 |
| Pin/lock dependencies and define Python version | High | Low | High | 1 |
| Add CI test, smoke test and secret scan | High | Low | High | 1–2 |
| Define Linux production startup and process supervision | High | Medium | High | 2 |
| Deploy one Lightsail instance with reverse proxy/TLS | High | Medium | High | 3 |
| Inject secrets outside the repository | High | Medium | High | 3 |
| Add rollback and post-deploy smoke test | High | Medium | High | 3–4 |
| Add basic uptime/memory/disk monitoring | High | Low | High | 5 |
| Split app.py into smaller modules | Medium | Medium | Medium | 5 |
| Add durable persistence | Conditional | Medium to high | Low now | 6 |
| Containerise for ECS | Conditional | Medium | Low now | 6 |
| Add database, Redis, queue or multi-region architecture | Conditional | High | Low now | 6 |

## 31. Recommended End State

### Recommended End State for Launch

- Streamlit remains the website framework.
- app.py remains the single entry point.
- Local catalogue and assets ship with the release.
- One Lightsail Linux instance runs the app behind a reverse proxy with HTTPS.
- Session-only profiles and comparison state remain ephemeral.
- No database or S3 is introduced.
- MIM credentials are injected securely; MIM and FedEO remain optional/failure-isolated.
- Git main is protected and CI runs the existing tests plus startup checks.
- Deployment is commit-based with approval and rollback.
- Logs are safe and basic monitoring is in place.

### Recommended Evolution if Usage Grows

- Move the same application into a container and deploy to ECS/Fargate or ECS Express Mode.
- Use one task first and add replicas only after measuring demand.
- Add ALB/TLS/health checks as part of the managed service.
- Keep catalogue and matching logic intact.
- Add S3 for uploads/outputs and DynamoDB/RDS only for explicit durable records.
- Add a queue/worker path only for work that is proven to exceed interactive request limits.
- Add authentication and durable user records only when the product requires them.

## 32. What I Would Do First

1. Confirm .env is ignored with a Git check, inspect the intended staged file list, and rotate the MIM credential if it has ever left the local machine.
2. Make the first clean Git commit with source, tests, required data/assets, README and safe documentation; exclude .venv, .env, output screenshots/PDFs, tmp files and unreviewed generated artifacts.
3. Pin the currently tested dependency set and define the supported Python version instead of allowing open-ended installs from requirements.txt.
4. Document the production command for app.py, including headless mode, address, port, working directory and process supervision.
5. Decide whether the first hosted audience is private or public. For a private pilot, protect the reverse proxy. For a public demo, disable or separately gate MIM until abuse and quota controls exist.
6. Deploy one 1 GB Lightsail Linux instance with a reverse proxy, HTTPS, a non-root Streamlit service, and a direct-port firewall rule.
7. Inject MIMS_API_USERNAME and MIMS_API_PASSWORD from protected deployment secrets or Parameter Store; keep them out of the release directory.
8. Add CI for the 83-test suite, local-catalogue startup, secret scanning and a post-deploy HTTP smoke test.
9. Add journald/CloudWatch-safe logging, external uptime checking and a documented rollback to the previous release.
10. Measure memory, request latency and concurrent sessions before considering containers, ALB, S3 or a database.

## 33. What I Would NOT Change Yet

- I would not replace Streamlit with React, Next.js or a separate frontend/backend.
- I would not move the local 26-record catalogue into a database.
- I would not add RDS, DynamoDB, Redis, EFS or S3 without a data requirement.
- I would not add Lambda solely because traffic is low; the current server model is a better fit for the smallest change.
- I would not add ECS/Fargate, an ALB or NAT Gateway at launch.
- I would not introduce Kubernetes, microservices, service meshes or multi-region infrastructure.
- I would not make custom profiles persistent until users actually need saved work.
- I would not rewrite the matching or conservative FedEO logic merely for stylistic reasons.
- I would not remove the local fallback catalogue; it is one of the application's strongest resilience features.
- I would not add a full identity platform before the access model and user requirements are known.
- I would not retain generated screenshots/PDFs in Git by default.

## 34. Scaling Triggers

| Signal | Why It Matters | Likely Response |
| --- | --- | --- |
| Sustained concurrent sessions above the measured single-instance comfort level | Streamlit sessions and caches share host memory/CPU | Increase instance size first; then evaluate ECS |
| MIM/FedEO calls make normal interactions slow | Synchronous external calls block user interactions | Improve caching/rate limits; schedule refreshes or add a worker path |
| Frequent process restarts or memory pressure | Ephemeral sessions and in-process caches become unreliable | Profile memory, increase host size, then containerise if needed |
| Need for two instances or zero-downtime deploys | One-host replacement interrupts sessions | Move to ECS/Fargate with health checks and rolling deployment |
| Users need profiles/comparisons after restart | st.session_state is no longer sufficient | Add authentication and durable storage |
| Uploads or generated reports appear | Local filesystem is not durable/shared | Store objects in S3 with lifecycle rules |
| Queryable user/catalogue records appear | JSON files no longer provide appropriate concurrency/query semantics | Choose DynamoDB or RDS based on access patterns |
| Repeated identical external data requests grow | Per-instance cache duplication wastes latency/quota | Add a shared cache or scheduled catalogue refresh |
| Rising AWS bill despite low usage | Fixed infrastructure or logs may dominate | Review ALB/NAT/monitoring/transfer resources and right-size |
| Public abuse or credential-quota risk | Server-held integration credentials are exposed to untrusted triggers | Add authentication, rate limiting and separate integration controls |
| Requirement for higher availability | A single instance is a single failure domain | Move to managed multi-instance architecture with backups and health checks |

## 35. Open Decisions

| Decision | Why It Matters | Current Assumption / Recommendation | What Would Change It |
| --- | --- | --- | --- |
| Public or private website? | Determines authentication, abuse and data exposure controls | Private pilot first; use reverse-proxy access protection | Approved public catalogue and tested MIM exposure controls |
| Is MIM available to anonymous users? | Server-held credentials could be repeatedly consumed | No; gate it for the first public deployment | Explicit quota, authentication and rate-limit design |
| Custom domain required? | Determines DNS and certificate work | Optional for private pilot; use one when audience needs it | Branding, public launch or institutional access |
| Expected file uploads/exports? | Determines S3 and lifecycle design | None at launch | Product scope adds files |
| Must users save profiles? | Determines authentication and persistence | No; session-only is current contract | User research or product requirement |
| Required availability target? | Determines replicas, backups and managed infrastructure | Best-effort small pilot | Contractual or operational uptime requirement |
| AWS monthly budget? | Determines Lightsail versus EC2/ECS trade-off | Keep fixed runtime near the small Lightsail bundle | Budget supports managed multi-service architecture |
| Preferred AWS region? | Affects latency, price and API reachability | Choose region near users and validate external API latency | Data residency, provider availability or user geography |
| Who owns operations? | A website without an owner will fail operationally | Assign one technical owner and one backup | Team and support model changes |
| How frequently does the catalogue change? | Determines Git release versus data pipeline | Git-reviewed catalogue updates are enough | Frequent automated ingestion or large data volume |
| Is the MIM API contract stable? | Runtime schema discovery can fail when the external API changes | Keep defensive adapter and local fallback | Contract guarantees or a need for preloaded snapshots |
| Is multi-region required? | Drives major fixed cost and data/deployment complexity | No | User geography, resilience or contractual requirement |

## Final Synthesis

The repository does not need a platform rewrite to become a website. It needs a disciplined deployment boundary around an existing Streamlit application. The evidence supports a low-cost single-host AWS launch, with the application and catalogue retained as-is wherever possible, secure secret handling added before exposure, and operational checks introduced before automation.

The central design rule should remain:

> Optimise the launch architecture for simplicity and low cost at very low traffic, while preserving a sensible path to moderate future growth.

The sensible growth path is a managed container service later, not a serverless rewrite now. The sensible launch path is one small Lightsail host, not a distributed AWS estate.
