# Verification
Verified on 2026-11-18 after the security dependency update, Node.js 24.19.0.

## Fresh checks on this public source edition
- Clean npm ci --ignore-scripts: completed from the lockfile in an isolated tree. Prisma Client was generated explicitly afterwards.
- Vitest: 9 files, 66 tests passed.
- ESLint: passed.
- TypeScript: tsc --noEmit --incremental false passed.
- Next.js 15.5.28 production build: passed, including compilation, type validation, page generation and build tracing.
- npm registry advisory lookup over all 571 locked package names: no advisories returned, including development dependencies.
- Production dependency versions and application source code did not change in this security update.

## Security dependency changes
Vitest 4.1.12, Vite 8.1.6, brace-expansion 5.0.13, js-yaml 4.3.2 and minimatch 11.0.9 for the affected modern dependency branch. Existing minimatch 3.x remains on its unaffected branch.
The earlier picomatch advisory GHSA-fc5q-39xc-vjpf was withdrawn upstream; it is not treated as a current vulnerability or silently suppressed.

## Conditions and limits
Checks used synthetic input and a non-serving loopback database URL. No production data, provider credentials, model calls, live messages, payments or platform requests were used. The build fetched public Google font assets.
No real database migration or database-backed E2E acceptance was performed. Advisory databases cannot establish the absence of unknown vulnerabilities.
The private AI conversation system, response templates, sales strategy, sample conversation corpus, internal fixtures and original Git history are not included.

## CI configuration
The GitHub Actions example remains at ci/github-actions.yml as a reference, not an active workflow. Run the documented commands locally. Enabling Actions requires separate workflow publication; no successful GitHub CI run is claimed.
