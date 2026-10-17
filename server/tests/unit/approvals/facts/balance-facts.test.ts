import { describe, expect, test } from "bun:test";
import type { ApprovalCustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { approvalFactsToJson } from "@/internal/approvals/check/approvalFactsToJson";
import { createBalanceParamsToFacts } from "@/internal/approvals/facts/balances/createBalanceParamsToFacts";
import { updateBalanceParamsToFacts } from "@/internal/approvals/facts/balances/updateBalanceParamsToFacts";

const customer = {
	id: "cus_1",
	customer_products: [],
	has_paid: true,
} as unknown as ApprovalCustomerFacts;

describe("balance facts", () => {
	test("grant credits: feature, amount (or its granted_balance alias), unlimited, expiry and reset", () => {
		expect(
			createBalanceParamsToFacts({
				customer,
				params: {
					feature_id: "messages",
					granted_balance: 50,
					expires_at: 1000,
					reset: { interval: "month" },
				} as Parameters<typeof createBalanceParamsToFacts>[0]["params"],
			}),
		).toEqual({
			customer,
			feature_id: "messages",
			included_grant: 50,
			unlimited: false,
			expires_at: 1000,
			reset: { interval: "month" },
		});
	});

	test("set balance: the values the request sets, null elsewhere, and current_balance read as remaining", () => {
		expect(
			updateBalanceParamsToFacts({
				customer,
				params: { feature_id: "messages", current_balance: 20 } as Parameters<
					typeof updateBalanceParamsToFacts
				>[0]["params"],
			}),
		).toEqual({
			customer,
			feature_id: "messages",
			included_grant: null,
			add_to_balance: null,
			remaining: 20,
			usage: null,
		});
	});

	test("the decision log keeps only the customer fields rules read", () => {
		expect(
			approvalFactsToJson({ facts: { customer, feature_id: "messages" } }),
		).toEqual({
			customer: { id: "cus_1", has_paid: true },
			feature_id: "messages",
		});
		expect(approvalFactsToJson({ facts: null })).toEqual({});
	});
});
