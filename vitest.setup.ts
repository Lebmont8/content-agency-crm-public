import { vi } from "vitest";

// Unit tests never talk to a real database; a syntactically valid URL is
// still required for PrismaClient construction.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/test_never_connects";

vi.mock("server-only", () => ({}));
