/**
 * F2 contract: non-billing facts map each route's params onto the fields its
 * `when` area reads, so a rule judges the request as it will run.
 */

import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { createBalanceParamsToFacts } from "@/internal/approvals/facts/balances/createBalanceParamsToFacts.js";
import { updateBalanceParamsToFacts } from "@/internal/approvals/facts/balances/updateBalanceParamsToFacts.js";
import { featureEditToFacts } from "@/internal/approvals/facts/catalog/featureEditToFacts.js";
import { planEditToFacts } from "@/internal/approvals/facts/catalog/planEditToFacts.js";
import { customerToFacts } from "@/internal/approvals/facts/customers/customerToFacts.js";
import { createInvoicePreviewToFacts } from "@/internal/approvals/facts/invoices/createInvoicePreviewToFacts.js";
import { invoiceToFacts } from "@/internal/approvals/facts/invoices/invoiceToFacts.js";
import { rewardApplyToFacts } from "@/internal/approvals/facts/rewards/rewardApplyToFacts.js";

const customer = customers.create({});

describe("non-billing facts", () => {
	test("grant credits: feature, amount, unlimited, expiry and reset", () => {
		expect(
			createBalanceParamsToFacts({
				fullCustomer: customer,
				params: {
					feature_id: "ai_credits",
					included_grant: 200,
					reset: { interval: ResetInterval.Month },
				},
			}),
		).toEqual({
			customer,
			feature_id: "ai_credits",
			included_grant: 200,
			unlimited: false,
			expires_at: null,
			reset: { interval: "month" },
		});

		expect(
			createBalanceParamsToFacts({
				fullCustomer: customer,
				params: {
					feature_id: "seats",
					granted_balance: 5,
					unlimited: false,
					expires_at: 1_800_000_000_000,
				},
			}),
		).toMatchObject({
			included_grant: 5,
			expires_at: 1_800_000_000_000,
			reset: null,
		});
	});

	test("set balance: the values the request sets, null where it leaves them", () => {
		expect(
			updateBalanceParamsToFacts({
				fullCustomer: customer,
				params: {
					feature_id: "ai_credits",
					add_to_balance: 50,
				},
			}),
		).toEqual({
			customer,
			feature_id: "ai_credits",
			included_grant: null,
			add_to_balance: 50,
			remaining: null,
			usage: null,
		});
	});

	test("set balance: the legacy current_balance alias reads as remaining", () => {
		expect(
			updateBalanceParamsToFacts({
				fullCustomer: customer,
				params: { feature_id: "ai_credits", current_balance: 500 },
			}).remaining,
		).toBe(500);
	});

	test("invoices: a new invoice's total is its preview's; an existing one carries its refund", () => {
		expect(
			createInvoicePreviewToFacts({
				fullCustomer: customer,
				preview: { total: 120 },
			}),
		).toEqual({ customer, total: 120, refund: null });

		expect(
			invoiceToFacts({
				fullCustomer: customer,
				invoice: { total: 80 },
				refundAmount: 30,
			}),
		).toEqual({ customer, total: 80, refund: { amount: 30 } });
	});

	test("rewards, customers and catalog name what they act on", () => {
		expect(
			rewardApplyToFacts({ fullCustomer: customer, rewardId: "launch_20" }),
		).toEqual({ customer, reward_id: "launch_20" });
		expect(customerToFacts({ fullCustomer: customer })).toEqual({ customer });
		expect(planEditToFacts({ planId: "pro" })).toEqual({ plan_id: "pro" });
		expect(featureEditToFacts({ featureId: "ai_credits" })).toEqual({
			feature_id: "ai_credits",
		});
	});
});
