/**
 * Contract: every approval rule reads as one sentence in the Approvals list,
 * "<who> can <actions> when <conditions>", worded as on the Paper boards.
 */

import { describe, expect, test } from "bun:test";
import type {
	ActionFilter,
	ApprovalAction,
	ApprovalRule,
	RuleSubject,
} from "@/views/settings/sections/approvals/approvalRuleTypes";
import {
	buildRuleSentence,
	type RuleLabels,
	sentenceText,
} from "@/views/settings/sections/approvals/buildRuleSentence";

const labels: RuleLabels = {
	member: (userId) =>
		({ usr_john: "John Doe", usr_jack: "Jack Lee" })[userId] ?? userId,
	plan: (planId) =>
		({
			enterprise: "Enterprise",
			pro: "Pro",
			team: "Team",
			starter: "Starter",
		})[planId] ?? planId,
	feature: (featureId) =>
		({
			messages: { name: "Messages", unit: "messages" },
			ai_credits: { name: "AI credits", unit: "credits" },
		})[featureId] ?? { name: featureId, unit: "" },
	money: (amount) => `$${amount}`,
};

const sales: RuleSubject = { type: "role", role: "sales" };

const textOf = ({
	subjects = [sales],
	actions = ["billing.attach"],
	when = null,
}: {
	subjects?: RuleSubject[];
	actions?: ApprovalAction[];
	when?: ActionFilter | null;
}) => {
	const rule: ApprovalRule = {
		id: "apr_test",
		name: "Test",
		subjects,
		actions,
		when,
		note: null,
		enabled: true,
		version: 1,
		updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
		created_at: 0,
		updated_at: 0,
	};
	return sentenceText(buildRuleSentence({ rule, labels }));
};

const trialUnder = ({ days, months }: { days: number; months: number }) => ({
	$or: [
		{ free_trial: null },
		{ free_trial: { duration_type: "day", duration_length: { $lt: days } } },
		{
			free_trial: { duration_type: "month", duration_length: { $lt: months } },
		},
	],
});

describe("rule sentence: subjects", () => {
	test.each<[string, RuleSubject[], string]>([
		["everyone", [{ type: "everyone" }], "Everyone can Attach"],
		["role", [sales], "Sales can Attach"],
		["user", [{ type: "user", user_id: "usr_john" }], "John Doe can Attach"],
		[
			"several of each type",
			[
				sales,
				{ type: "role", role: "engineering" },
				{ type: "user", user_id: "usr_john" },
			],
			"Sales Engineering John Doe can Attach",
		],
	])("%s", (_name, subjects, expected) => {
		expect(textOf({ subjects })).toBe(expected);
	});
});

describe("rule sentence: actions", () => {
	test.each<[ApprovalAction, string]>([
		["billing.attach", "Attach"],
		["billing.update_subscription", "Update subscription"],
		["billing.set_plans", "Set plans"],
		["billing.schedule", "Schedule"],
		["billing.cancel", "Cancel"],
		["billing.uncancel", "Uncancel"],
		["invoices.create", "Create invoice"],
		["invoices.finalize", "Finalize invoice"],
		["invoices.pay", "Pay invoice"],
		["invoices.void", "Void invoice"],
		["invoices.update", "Update invoice"],
		["invoices.reissue", "Reissue invoice"],
		["invoices.credit_note", "Create credit note"],
		["balances.create", "Grant credits"],
		["balances.update", "Set balance"],
		["rewards.create", "Create reward"],
		["rewards.apply", "Apply reward"],
		["customers.create", "Create customer"],
		["customers.update", "Update customer"],
		["customers.delete", "Delete customer"],
		["catalog.edit_plans", "Edit plans"],
		["catalog.edit_features", "Edit features"],
		["api_keys.create", "Create API key"],
		["migrations.create", "Create migration"],
		["migrations.run", "Run migration"],
		["members.invite", "Invite member"],
		["members.change_role", "Change member role"],
	])("%s", (action, label) => {
		expect(
			textOf({ subjects: [{ type: "everyone" }], actions: [action] }),
		).toBe(`Everyone can ${label}`);
	});

	test("several actions read in order", () => {
		expect(
			textOf({
				actions: [
					"billing.attach",
					"billing.update_subscription",
					"billing.set_plans",
				],
			}),
		).toBe("Sales can Attach Update subscription Set plans");
	});
});

describe("rule sentence: when clauses from the boards", () => {
	test.each<[string, Parameters<typeof textOf>[0], string]>([
		[
			"trial cap stored as day/month branches reads as one row",
			{
				subjects: [
					sales,
					{ type: "role", role: "engineering" },
					{ type: "user", user_id: "usr_john" },
				],
				actions: [
					"billing.attach",
					"billing.update_subscription",
					"billing.set_plans",
				],
				when: {
					incoming: { $every: trialUnder({ days: 60, months: 2 }) },
					paid: false,
				},
			},
			"Sales Engineering John Doe can Attach Update subscription Set plans when Free trial < 2 months and Charges customer is No",
		],
		[
			"cancel timing",
			{
				subjects: [{ type: "role", role: "support" }],
				actions: ["billing.cancel"],
				when: { cancel_action: "cancel_end_of_cycle" },
			},
			"Support can Cancel when Timing is End of cycle",
		],
		[
			"trial in days and incoming plan is any of",
			{
				when: {
					incoming: {
						$every: {
							free_trial: {
								duration_type: "day",
								duration_length: { $lte: 31 },
							},
							plan_id: { $in: ["pro", "team"] },
						},
					},
				},
			},
			"Sales can Attach when Free trial ≤ 31 days and Incoming plan is any of Pro, Team",
		],
		[
			"grant credits with feature unit",
			{
				subjects: [{ type: "everyone" }],
				actions: ["balances.create"],
				when: { feature_id: "messages", included_grant: { $lte: 100 } },
			},
			"Everyone can Grant credits when Feature is Messages and Amount ≤ 100 messages",
		],
		[
			"case 1: enterprise trials",
			{
				actions: ["billing.attach", "billing.update_subscription"],
				when: {
					incoming: {
						$every: {
							plan_id: "enterprise",
							...trialUnder({ days: 60, months: 2 }),
						},
					},
					paid: false,
				},
			},
			"Sales can Attach Update subscription when Incoming plan is Enterprise and Free trial < 2 months and Charges customer is No",
		],
		[
			"case 2: recurring discounts",
			{
				actions: ["billing.attach", "billing.update_subscription"],
				when: {
					discounts: { $every: { percent_off: { $lte: 20 } } },
					incoming: { $every: { recurring: true } },
				},
			},
			"Sales can Attach Update subscription when Discount percent off ≤ 20% and Incoming plan is recurring is Yes",
		],
		[
			"case 3: OR groups on cancel, outgoing reads as Plan, refund cap",
			{
				subjects: [{ type: "role", role: "support" }],
				actions: ["billing.cancel"],
				when: {
					$or: [
						{ cancel_action: "cancel_end_of_cycle" },
						{
							cancel_action: "cancel_immediately",
							outgoing: { $every: { plan_id: "starter" } },
							$or: [{ refund: null }, { refund: { amount: { $lte: 50 } } }],
						},
					],
				},
			},
			"Support can Cancel when Timing is End of cycle or Timing is Immediately and Plan is Starter and Refund ≤ $50",
		],
		[
			"case 4: one person's tighter limit",
			{
				subjects: [{ type: "user", user_id: "usr_john" }],
				actions: ["balances.create"],
				when: { feature_id: "ai_credits", included_grant: { $lte: 50 } },
			},
			"John Doe can Grant credits when Feature is AI credits and Amount ≤ 50 credits",
		],
		[
			"a range keeps both limits",
			{
				subjects: [{ type: "everyone" }],
				actions: ["balances.create"],
				when: {
					feature_id: "messages",
					included_grant: { $gte: 10, $lte: 100 },
				},
			},
			"Everyone can Grant credits when Feature is Messages and Amount ≥ 10 messages and Amount ≤ 100 messages",
		],
		[
			"sends a checkout link",
			{ when: { checkout: true } },
			"Sales can Attach when Sends a checkout link",
		],
		[
			"doesn't send a checkout link",
			{ when: { checkout: false, paid: false } },
			"Sales can Attach when Doesn't send a checkout link and Charges customer is No",
		],
		[
			"a shape the list can't word yet",
			{ when: { invoice_mode: { enabled: true } } },
			"Sales can Attach when Custom condition",
		],
	])("%s", (_name, input, expected) => {
		expect(textOf(input)).toBe(expected);
	});
});
