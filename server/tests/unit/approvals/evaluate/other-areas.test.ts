/**
 * S4 contract: every `when` area has typed facts that mirror its field names,
 * and relative dates resolve against the `now` passed in.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each area's rule matches its own facts.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { evaluateApprovalRules } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { addDays } from "date-fns";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });
const sales = { type: "role", role: "sales" } as const;
const now = new Date("2026-10-15T12:00:00Z");

describe("evaluateApprovalRules: other areas and relative dates", () => {
	test("starts_at within 30 days of now, resolved against the given now", () => {
		const ruleSet = [
			storedRule({
				id: "apr_soon",
				rule: rules.rule({
					name: "Starts within a month",
					subjects: [sales],
					actions: ["billing.schedule"],
					when: {
						$or: [
							{ starts_at: null },
							{ starts_at: { $lte: { days_from_now: 30 } } },
						],
					},
				}),
			}),
		];
		const startingIn = ({ days }: { days: number }) =>
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.schedule",
				facts: facts.billingChange({
					starts_at: addDays(now, days).getTime(),
				}),
				rules: ruleSet,
				env: AppEnv.Live,
				now: now.getTime(),
			});

		expect(startingIn({ days: 10 }).verdict).toBe("allow");
		expect(startingIn({ days: 45 })).toMatchObject({
			verdict: "deny",
			violations: [
				{
					field: "starts_at",
					label: "Start date",
					limit: "≤ 30 days from now",
					actual: "45 days from now",
				},
			],
		});
	});

	test("balances, invoices and rewards match their own facts", () => {
		const balanceRule = storedRule({
			id: "apr_balance",
			rule: rules.rule({
				name: "Small top-ups",
				subjects: [sales],
				actions: ["balances.update"],
				when: { feature_id: "ai_credits", add_to_balance: { $lte: 100 } },
			}),
		});
		const topUp = ({ amount }: { amount: number }) =>
			evaluateApprovalRules({
				principal: salesRep,
				action: "balances.update",
				facts: facts.balanceUpdate({ add_to_balance: amount }),
				rules: [balanceRule],
				env: AppEnv.Live,
			}).verdict;
		expect(topUp({ amount: 80 })).toBe("allow");
		expect(topUp({ amount: 120 })).toBe("deny");

		const invoiceRule = storedRule({
			id: "apr_invoice",
			rule: rules.rule({
				name: "Small invoices",
				subjects: [sales],
				actions: ["invoices.create"],
				when: { total: { $lte: 500 } },
			}),
		});
		expect(
			evaluateApprovalRules({
				principal: salesRep,
				action: "invoices.create",
				facts: facts.invoice({ total: 900 }),
				rules: [invoiceRule],
				env: AppEnv.Live,
			}).verdict,
		).toBe("deny");

		const rewardRule = storedRule({
			id: "apr_reward",
			rule: rules.rule({
				name: "Summer sale only",
				subjects: [sales],
				actions: ["rewards.apply"],
				when: { reward_id: { $in: ["summer_sale"] } },
			}),
		});
		expect(
			evaluateApprovalRules({
				principal: salesRep,
				action: "rewards.apply",
				facts: facts.rewardApply({ reward_id: "black_friday" }),
				rules: [rewardRule],
				env: AppEnv.Live,
			}),
		).toMatchObject({
			verdict: "deny",
			violations: [
				{
					field: "reward_id",
					label: "Reward",
					limit: "summer_sale",
					actual: "black_friday",
				},
			],
		});
	});

	test("customers, catalog and who-only rules", () => {
		const customerRule = storedRule({
			id: "apr_customer",
			rule: rules.rule({
				name: "Customers on a plan",
				subjects: [sales],
				actions: ["customers.update"],
				when: { customer: { customer_id: { $ne: "cus_vip" } } },
			}),
		});
		const updateCustomer = ({ customerId }: { customerId: string }) =>
			evaluateApprovalRules({
				principal: salesRep,
				action: "customers.update",
				facts: facts.customerChange({
					customer: facts.customer({ customerId }),
				}),
				rules: [customerRule],
				env: AppEnv.Live,
			}).verdict;
		expect(updateCustomer({ customerId: "cus_small" })).toBe("allow");
		expect(updateCustomer({ customerId: "cus_vip" })).toBe("deny");

		const catalogRule = storedRule({
			id: "apr_catalog",
			rule: rules.rule({
				name: "Edit the starter plan",
				subjects: [sales],
				actions: ["catalog.edit_plans"],
				when: { plan_id: "starter" },
			}),
		});
		expect(
			evaluateApprovalRules({
				principal: salesRep,
				action: "catalog.edit_plans",
				facts: facts.catalogPlan({ planId: "enterprise" }),
				rules: [catalogRule],
				env: AppEnv.Live,
			}).verdict,
		).toBe("deny");

		expect(
			evaluateApprovalRules({
				principal: salesRep,
				action: "api_keys.create",
				facts: null,
				rules: [
					storedRule({
						id: "apr_keys",
						rule: rules.whoOnly({ actions: ["api_keys.create"] }),
					}),
				],
				env: AppEnv.Live,
			}),
		).toMatchObject({ verdict: "allow", decided_by: { rule_id: "apr_keys" } });
	});
});
