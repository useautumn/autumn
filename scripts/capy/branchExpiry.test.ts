import { expect, test } from "bun:test";
import { CAPY_BRANCH_TTL_DAYS, capyBranchExpiresAt } from "./branchExpiry.ts";

test("capy branches expire 14 days after creation", () => {
	const createdAt = Date.parse("2026-10-08T12:34:56.789Z");

	expect(CAPY_BRANCH_TTL_DAYS).toBe(14);
	expect(capyBranchExpiresAt({ createdAt })).toBe("2026-10-22T12:34:56.789Z");
});
