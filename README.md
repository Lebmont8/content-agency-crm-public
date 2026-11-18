# Content Agency CRM — public source edition

A real multi-tenant Next.js/TypeScript CRM code edition, not a simulated dashboard. It includes authentication, tenant isolation, contacts, manual inbox operations, content metadata, shifts, KPI, audit trails and official platform-adapter infrastructure. External sends remain fail-closed until an operator supplies and reviews their own transport configuration.

## Publication boundary
The commercial AI conversation system is NOT distributed. The separate desktop client and internal QA fixtures are not part of this edition. No private instructions, response templates, persona examples, conversation playbooks, automatic sales decisions, adaptive pricing, internal fixtures, mock conversation datasets or original repository history are included. Compatibility boundaries explicitly reject automation requests. The private production product is not modified by this edition.

This is not the complete commercial product and does not claim working autonomous messaging. Retained schema fields are compatibility metadata, not bundled instructions. Use manual workflows and your own independent integrations.

## Local development
Node.js 22+, PostgreSQL and your own disposable database are required.
Copy .env.example to .env and provide locally generated secrets. Never use production credentials or data.

~~~sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
~~~

Public self-registration is disabled by default. Use the local owner bootstrap command documented in SETUP.md; no fixed login, account or customer fixture is included.

## Verification
See VERIFICATION.md for checks actually completed on this source edition. Existing private-product test counts are not claimed as acceptance of this export. AI/provider endpoints are intentionally unavailable.

## Rights
Source inspection only, all rights reserved. See LICENSE. Dependencies and third-party assets retain their own licenses.

## CI configuration
The GitHub Actions example is included at ci/github-actions.yml as a reference, not an active workflow. Run the documented verification commands locally. To enable Actions in your own repository, place this file under .github/workflows/.
