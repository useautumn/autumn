import { expect, test } from "bun:test";
import {
	CAPY_BRANCH_TTL_DAYS,
	capyBranchExpiresAt,
	hasCapyBranchExpired,
} from "./branchExpiry.ts";

test("capy branches expire 14 days after creation", () => {
	const createdAt = Date.parse("2026-10-08T12:34:56.789Z");

	expect(CAPY_BRANCH_TTL_DAYS).toBe(14);
	expect(capyBranchExpiresAt({ createdAt })).toBe("2026-10-22T12:34:56.789Z");
});

test("a branch counts as expired once its expiry has passed", () => {
	const expiresAt = "2026-10-22T12:00:00.000Z";

	expect(
		hasCapyBranchExpired({
			expiresAt,
			now: Date.parse("2026-10-22T11:59:59.999Z"),
		}),
	).toBe(false);
	expect(hasCapyBranchExpired({ expiresAt, now: Date.parse(expiresAt) })).toBe(
		true,
	);
	expect(hasCapyBranchExpired({ expiresAt: undefined, now: Date.now() })).toBe(
		false,
	);
});
