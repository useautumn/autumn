import { describe, expect, test } from "bun:test";
import type { ChatApproval } from "@autumn/shared";
import { assertDecidableApproval } from "../../../src/internal/approvals/utils/assertDecidableApproval.js";

const NOW = 1_700_000_000_000;

const approval = (overrides: Partial<ChatApproval>): ChatApproval =>
	({
		expires_at: NOW + 60_000,
		status: "pending",
		...overrides,
	}) as ChatApproval;

describe("assertDecidableApproval", () => {
	test("pending and unexpired is decidable", () => {
		expect(
			assertDecidableApproval({ approval: approval({}), now: NOW }),
		).toEqual({ decidable: true });
	});

	test("expired pending card is refused", () => {
		expect(
			assertDecidableApproval({
				approval: approval({ expires_at: NOW - 1 }),
				now: NOW,
			}),
		).toEqual({ decidable: false, reason: "expired" });
	});

	test("missing expiry is treated as expired", () => {
		expect(
			assertDecidableApproval({
				approval: approval({ expires_at: null as never }),
				now: NOW,
			}),
		).toEqual({ decidable: false, reason: "expired" });
	});

	test("decided card is refused with its status", () => {
		expect(
			assertDecidableApproval({
				approval: approval({ status: "approved" }),
				now: NOW,
			}),
		).toEqual({ decidable: false, reason: "already approved" });
	});
});
