# Verification
Verified on 2026-11-18, Node.js 22+.

## Completed on this public source edition
- Vitest: 9 files, 66 tests passed. Coverage includes tenant guards, permissions, MFA, session-token primitives, HTTPS policy, login throttling, disabled public registration, fail-closed AI providers, fixed-only manual pricing, absent mock conversation data and rejected fabricated mock sends.
- ESLint: passed without errors or warnings.
- TypeScript: tsc --noEmit --incremental false passed.
- Prisma: schema validation passed.
- Next.js production build: compilation, type validation, generation of 37 static-page build steps and build tracing completed successfully. Lint was run separately.

## Conditions and limits
Matching existing dependencies and a matching generated Prisma client were mounted read-only for acceptance; no production code, data, dependencies or workers were changed. No clean npm reinstall or fresh database migration was performed during this source-export check.
Tests used synthetic input and a non-serving loopback database URL. No real customer data, model-provider calls, live messages, payments or platform credentials were used. The build fetched public Google font assets.
Database-backed UI workflows, real platform delivery and owner-bootstrap integration against a fresh database have not received end-to-end acceptance. No claim of complete commercial-product functionality is made.
The private AI conversation system, response templates, sales strategy, sample conversation corpus, internal fixtures and original Git history are not included.

## CI configuration
The GitHub Actions example is included at ci/github-actions.yml as a reference, not an active workflow. Run the documented verification commands locally. To enable Actions in your own repository, place this file under .github/workflows/.
