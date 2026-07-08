import { expect, test } from "bun:test";

// Canary: exists only to prove workers run freshly pushed code (stale-warm race gate).
test("tw freshness canary", () => {
	expect(1 + 1).toBe(2);
});
