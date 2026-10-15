/**
 * Contract: every approval rule reads as one sentence in the Approvals list,
 * "<who> can <actions> when <conditions>", worded as on the Paper boards.
 */

import { describe, expect, test } from "bun:test";
import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleWhen,
	RuleSubject,
} from "@autumn/shared";
import {
	buildRuleSentence,
	type RuleLabels,
	type SentencePart,
} from "@/views/settings/sections/approvals/buildRuleSentence";

const sentenceText = (parts: SentencePart[]) =>
	parts
		.map((part) =>
			part.kind === "condition"
				? [part.field, part.operator, part.value].filter(Boolean).join(" ")
				: part.text,
		)
		.join(" ");

const NAMES: Record<string, string> = {
	usr_john: "John Doe",
	enterprise: "Enterprise",
	pro: "Pro",
	team: "Team",
	starter: "Starter",
	messages: "Messages",
	ai_credits: "AI credits",
};
const UNITS: Record<string, string> = {
	messages: "messages",
	ai_credits: "credits",
};

const labels: RuleLabels = {
	member: (id) => NAMES[id] ?? id,
	plan: (id) => NAMES[id] ?? id,
	feature: (id) => ({ name: NAMES[id] ?? id, unit: UNITS[id] ?? "" }),
	money: (amount) => `$${amount}`,
};

const sales: RuleSubject = { type: "role", role: "sales" };
const support: RuleSubject = { type: "role", role: "support" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };
const attachUpdate: ApprovalAction[] = [
	"billing.attach",
	"billing.update_subscription",
];

type Input = {
	subjects?: RuleSubject[];
	actions?: ApprovalAction[];
	when?: Record<string, unknown> | null;
};

const textOf = ({
	subjects = [sales],
	actions = ["billing.attach"],
	when = null,
}: Input) => {
	const rule: ApprovalRule = {
		id: "apr_test",
		name: "Test",
		subjects,
		actions,
		when: when as ApprovalRuleWhen | null,
		note: null,
		enabled: true,
		version: 1,
		updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
		created_at: 0,
		updated_at: 0,
	};
	return sentenceText(buildRuleSentence({ rule, labels }));
};

const trialUnder2Months = {
	$or: [
		{ free_trial: null },
		{ free_trial: { duration_type: "day", duration_length: { $lt: 60 } } },
		{ free_trial: { duration_type: "month", duration_length: { $lt: 2 } } },
	],
};

describe("rule sentence: subjects", () => {
	test.each<[RuleSubject[], string]>([
		[[everyone], "Everyone can Attach"],
		[[sales], "Sales can Attach"],
		[[john], "John Doe can Attach"],
		[
			[sales, { type: "role", role: "engineering" }, john],
			"Sales Engineering John Doe can Attach",
		],
	])("%j", (subjects, expected) => {
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
		["invoices.create", "Create invoices"],
		["invoices.finalize", "Finalize invoices"],
		["invoices.pay", "Pay invoices"],
		["invoices.void", "Void invoices"],
		["invoices.update", "Update invoices"],
		["invoices.reissue", "Reissue invoices"],
		["invoices.credit_note", "Issue credit notes"],
		["balances.create", "Grant credits"],
		["balances.update", "Set balance"],
		["rewards.create", "Create reward"],
		["rewards.apply", "Apply reward"],
		["customers.create", "Create customers"],
		["customers.update", "Update customers"],
		["customers.delete", "Delete customers"],
		["catalog.edit_plans", "Edit plans"],
		["catalog.edit_features", "Edit features"],
		["api_keys.create", "Create API keys"],
		["migrations.create", "Create migrations"],
		["migrations.run", "Run migrations"],
		["members.invite", "Invite members"],
		["members.change_role", "Change member roles"],
	])("%s", (action, label) => {
		expect(textOf({ subjects: [everyone], actions: [action] })).toBe(
			`Everyone can ${label}`,
		);
	});

	test("several actions read in order", () => {
		expect(textOf({ actions: [...attachUpdate, "billing.set_plans"] })).toBe(
			"Sales can Attach Update subscription Set plans",
		);
	});
});

describe("rule sentence: when clauses from the boards", () => {
	test.each<[string, Input, string]>([
		[
			"trial cap stored as day/month branches reads as one row",
			{
				subjects: [sales, { type: "role", role: "engineering" }, john],
				actions: [...attachUpdate, "billing.set_plans"],
				when: { incoming: { $every: trialUnder2Months }, paid: false },
			},
			"Sales Engineering John Doe can Attach Update subscription Set plans when Free trial < 2 months and Charges customer is No",
		],
		[
			"cancel timing",
			{
				subjects: [support],
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
				subjects: [everyone],
				actions: ["balances.create"],
				when: { feature_id: "messages", included_grant: { $lte: 100 } },
			},
			"Everyone can Grant credits when Feature is Messages and Amount ≤ 100 messages",
		],
		[
			"a range keeps both limits",
			{
				subjects: [everyone],
				actions: ["balances.create"],
				when: {
					feature_id: "messages",
					included_grant: { $gte: 10, $lte: 100 },
				},
			},
			"Everyone can Grant credits when Feature is Messages and Amount ≥ 10 messages and Amount ≤ 100 messages",
		],
		[
			"case 1: enterprise trials",
			{
				actions: attachUpdate,
				when: {
					incoming: {
						$every: { plan_id: "enterprise", ...trialUnder2Months },
					},
					paid: false,
				},
			},
			"Sales can Attach Update subscription when Incoming plan is Enterprise and Free trial < 2 months and Charges customer is No",
		],
		[
			"case 2: recurring discounts",
			{
				actions: attachUpdate,
				when: {
					discounts: { $every: { percent_off: { $lte: 20 } } },
					incoming: { $every: { recurring: true } },
				},
			},
			"Sales can Attach Update subscription when Discount percent off ≤ 20% and Recurring is Yes",
		],
		[
			"case 3: OR groups on cancel, outgoing reads as Plan, refund cap",
			{
				subjects: [support],
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
				subjects: [john],
				actions: ["balances.create"],
				when: { feature_id: "ai_credits", included_grant: { $lte: 50 } },
			},
			"John Doe can Grant credits when Feature is AI credits and Amount ≤ 50 credits",
		],
		[
			"sends a checkout link",
			{ when: { checkout: true } },
			"Sales can Attach when Sends checkout link is Yes",
		],
		[
			"doesn't send a checkout link",
			{ when: { checkout: false, paid: false } },
			"Sales can Attach when Sends checkout link is No and Charges customer is No",
		],
		[
			"set balance reads Included, schedule reads Timing",
			{
				subjects: [everyone],
				actions: ["balances.update"],
				when: { feature_id: "messages", included_grant: { $lte: 500 } },
			},
			"Everyone can Set balance when Feature is Messages and Included ≤ 500 messages",
		],
		[
			"plan schedule timing",
			{ when: { plan_schedule: "end_of_cycle" } },
			"Sales can Attach when Timing is End of cycle",
		],
		[
			"an $or that isn't a cap stays custom",
			{
				subjects: [support],
				actions: ["billing.cancel"],
				when: {
					$or: [{ refund: null }, { cancel_action: "cancel_end_of_cycle" }],
					outgoing: { $every: { plan_id: "starter" } },
				},
			},
			"Support can Cancel when Custom condition and Plan is Starter",
		],
		[
			"trial checks the list can't word stay custom",
			{
				when: {
					incoming: {
						$every: {
							free_trial: {
								duration_type: "month",
								duration_length: { $lte: 2 },
								card_required: true,
							},
						},
					},
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"an array with more than one quantifier stays custom",
			{
				when: {
					incoming: { $every: { recurring: true }, $some: { plan_id: "pro" } },
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"$some reads differently from $every, so it stays custom",
			{ when: { incoming: { $some: { plan_id: "pro" } } } },
			"Sales can Attach when Custom condition",
		],
		[
			"a matcher on the trial unit stays custom",
			{
				when: {
					incoming: {
						$every: {
							free_trial: {
								duration_type: { $eq: "month" },
								duration_length: { $lte: 2 },
							},
						},
					},
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"a trial filter without its unit stays custom",
			{
				when: {
					incoming: {
						$every: { free_trial: { duration_length: { $lte: 2 } } },
					},
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"an empty refund filter stays custom",
			{
				subjects: [support],
				actions: ["billing.cancel"],
				when: { refund: {} },
			},
			"Support can Cancel when Custom condition",
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
