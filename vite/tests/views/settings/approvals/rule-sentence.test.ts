/**
 * Contract: every approval rule reads as one sentence in the Approvals list,
 * "<who> can|can't <actions> when <conditions>", worded as on the Paper boards.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	type ApprovalAction,
	type ApprovalRule,
	type ApprovalRuleEffect,
	type RuleSubject,
} from "@autumn/shared";
import {
	buildRuleSentence,
	type RuleLabels,
	type SentencePart,
} from "@/views/settings/sections/approvals/buildRuleSentence";

const NAMES: Record<string, string> = {
	usr_john: "John Doe",
	usr_taylor: "Taylor",
	usr_kyle: "Kyle",
	sales: "Sales",
	support: "Support",
	finance_ops: "Finance ops team",
	enterprise: "Enterprise",
	credits_addon: "Credits add-on",
	pro: "Pro",
	team: "Team",
	hobby: "Hobby",
	starter: "Starter",
	messages: "Messages",
	ai_credits: "AI credits",
	deployments: "Deployments",
};
const UNITS: Record<string, string> = {
	messages: "messages",
	ai_credits: "credits",
};

const labels: RuleLabels = {
	member: (id) => NAMES[id] ?? id,
	role: (id) => NAMES[id] ?? id,
	plan: (id) => NAMES[id] ?? id,
	feature: (id) => ({ name: NAMES[id] ?? id, unit: UNITS[id] ?? "" }),
	money: (amount) => `$${amount}`,
};

const sentenceText = (parts: SentencePart[]) =>
	parts
		.map((part) =>
			part.kind === "condition"
				? [part.field, part.operator, part.value].filter(Boolean).join(" ")
				: part.text,
		)
		.join(" ");

const sales: RuleSubject = { type: "role", role_id: "sales" };
const support: RuleSubject = { type: "role", role_id: "support" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };
const attachUpdate: ApprovalAction[] = ["billing.attach", "billing.update"];

type Input = {
	effect?: ApprovalRuleEffect;
	subjects?: RuleSubject[];
	actions?: ApprovalAction[];
	filter?: Record<string, unknown> | null;
};

const textOf = ({
	effect = "allow",
	subjects = [sales],
	actions = ["billing.attach"],
	filter = null,
}: Input) => {
	const rule: ApprovalRule = {
		id: "apr_test",
		name: "Test",
		effect,
		position: 0,
		subjects,
		actions,
		filter,
		note: null,
		enabled: true,
		version: 1,
		updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
		created_at: 0,
		updated_at: 0,
	};
	return sentenceText(buildRuleSentence({ rule, labels }));
};

const trialUnder = (length: number, unit: string) => ({
	free_trial: { duration: { $lt: { length, unit } } },
});

describe("rule sentence: who and effect", () => {
	test.each<[string, Input, string]>([
		["everyone", { subjects: [everyone] }, "Everyone can Attach"],
		[
			"a role reads its name, not its id",
			{ subjects: [{ type: "role", role_id: "finance_ops" }] },
			"Finance ops team can Attach",
		],
		["a member", { subjects: [john] }, "John Doe can Attach"],
		[
			"several subjects",
			{ subjects: [sales, support, john] },
			"Sales Support John Doe can Attach",
		],
		[
			"a block rule reads can't",
			{ effect: "block", subjects: [everyone] },
			"Everyone can't Attach",
		],
	])("%s", (_name, input, expected) => {
		expect(textOf(input)).toBe(expected);
	});
});

describe("rule sentence: actions", () => {
	test.each(Object.keys(ACTIONS) as ApprovalAction[])("%s", (action) => {
		const definition: { label: string; sentence_label?: string } =
			ACTIONS[action];
		expect(textOf({ subjects: [everyone], actions: [action] })).toBe(
			`Everyone can ${definition.sentence_label ?? definition.label}`,
		);
	});

	test("bare-verb areas read their sentence label", () => {
		expect(
			textOf({ actions: ["invoices.create", "members.change_role"] }),
		).toBe("Sales can Create invoices Change member roles");
	});

	test("renamed actions read their new labels", () => {
		expect(
			textOf({
				actions: ["billing.update", "billing.create_schedule"],
			}),
		).toBe("Sales can Update subscription Create schedule");
		expect(
			textOf({ actions: ["invoices.issue_credit_note", "rewards.redeem"] }),
		).toBe("Sales can Issue credit notes Redeem reward");
	});
});

describe("rule sentence: PRD §8 examples", () => {
	test.each<[string, Input, string]>([
		[
			"A: block all billing",
			{
				effect: "block",
				subjects: [everyone],
				actions: [
					"billing.attach",
					"billing.update",
					"billing.set_plans",
					"billing.create_schedule",
					"billing.cancel",
					"billing.uncancel",
				],
			},
			"Everyone can't Attach Update subscription Set plans Create schedule Cancel Uncancel",
		],
		[
			"A: allow Sales enterprise trials",
			{
				filter: {
					paid: false,
					incoming: {
						$every: { plan_id: "enterprise", ...trialUnder(2, "month") },
					},
				},
			},
			"Sales can Attach when Charges customer is No and Incoming plan is Enterprise and Free trial length < 2 months",
		],
		[
			"B: credit add-ons on an entity",
			{
				effect: "block",
				subjects: [everyone],
				actions: attachUpdate,
				filter: {
					incoming: { $some: { plan_id: "credits_addon" } },
					entity: { $ne: null },
				},
			},
			"Everyone can't Attach Update subscription when Incoming plan is Credits add-on and Entity is any",
		],
		[
			"C: hand-written entity $or stays custom",
			{
				effect: "block",
				subjects: [everyone],
				actions: attachUpdate,
				filter: {
					incoming: {
						$some: { plan_id: { $in: ["pro", "enterprise", "hobby"] } },
					},
					$or: [
						{ entity: null },
						{ entity: { feature_id: { $ne: "deployments" } } },
					],
				},
			},
			"Everyone can't Attach Update subscription when Incoming plan is any of Pro, Enterprise, Hobby and Custom condition",
		],
		[
			"D: block Enterprise cancels",
			{
				effect: "block",
				subjects: [everyone],
				actions: ["billing.cancel"],
				filter: { outgoing: { $some: { plan_id: "enterprise" } } },
			},
			"Everyone can't Cancel when Plan is Enterprise",
		],
		[
			"D: hand-written allow with $some stays custom",
			{
				subjects: [
					{ type: "user", user_id: "usr_taylor" },
					{ type: "user", user_id: "usr_kyle" },
				],
				actions: ["billing.cancel"],
				filter: { outgoing: { $some: { plan_id: "enterprise" } } },
			},
			"Taylor Kyle can Cancel when Custom condition",
		],
		[
			"E: trials only for customers who never paid",
			{
				effect: "block",
				subjects: [everyone],
				filter: {
					customer: { has_paid: true },
					incoming: {
						$some: { plan_id: "enterprise", free_trial: { $ne: null } },
					},
				},
			},
			"Everyone can't Attach when Customer has paid before is Yes and Incoming plan is Enterprise and Free trial is any",
		],
		[
			"F: Sales can't customize",
			{
				effect: "block",
				actions: attachUpdate,
				filter: { incoming: { $some: { customized: true } } },
			},
			"Sales can't Attach Update subscription when Custom pricing is Yes",
		],
	])("%s", (_name, input, expected) => {
		expect(textOf(input)).toBe(expected);
	});
});

describe("rule sentence: conditions", () => {
	test.each<[string, Input, string]>([
		[
			"trial in days and incoming plan is any of",
			{
				filter: {
					incoming: {
						$every: {
							...trialUnder(31, "day"),
							plan_id: { $in: ["pro", "team"] },
						},
					},
				},
			},
			"Sales can Attach when Free trial length < 31 days and Incoming plan is any of Pro, Team",
		],
		[
			"a one-unit trial reads singular",
			{
				filter: {
					incoming: {
						$every: {
							free_trial: { duration: { $lte: { length: 1, unit: "year" } } },
						},
					},
				},
			},
			"Sales can Attach when Free trial length ≤ 1 year",
		],
		[
			"no trial",
			{
				effect: "block",
				filter: { incoming: { $some: { free_trial: null } } },
			},
			"Sales can't Attach when Free trial is none",
		],
		[
			"trial checks the list can't word stay custom",
			{
				filter: {
					incoming: {
						$every: {
							free_trial: {
								duration: { $lt: { length: 2, unit: "month" } },
								card_required: { $eq: true },
							},
						},
					},
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"the old trial branches stay custom",
			{
				filter: {
					incoming: {
						$every: {
							$or: [
								{ free_trial: null },
								{
									free_trial: {
										duration_type: "day",
										duration_length: { $lt: 60 },
									},
								},
							],
						},
					},
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"entity type and customer level",
			{ effect: "block", filter: { entity: { feature_id: "deployments" } } },
			"Sales can't Attach when Entity type is Deployments",
		],
		[
			"customer level reads Entity is none",
			{ effect: "block", filter: { entity: null } },
			"Sales can't Attach when Entity is none",
		],
		[
			"billing cycle anchor",
			{
				effect: "block",
				actions: ["billing.update"],
				filter: { billing_cycle_anchor: "now" },
			},
			"Sales can't Update subscription when Billing cycle is Reset now",
		],
		[
			"is not a plan reads $none",
			{ filter: { incoming: { $none: { plan_id: "enterprise" } } } },
			"Sales can Attach when Incoming plan is not Enterprise",
		],
		[
			"$none on anything but a plan stays custom",
			{ filter: { incoming: { $none: { customized: true } } } },
			"Sales can Attach when Custom condition",
		],
		[
			"allow: $some stays custom",
			{ filter: { incoming: { $some: { plan_id: "pro" } } } },
			"Sales can Attach when Custom condition",
		],
		[
			"block: $every stays custom",
			{ effect: "block", filter: { incoming: { $every: { plan_id: "pro" } } } },
			"Sales can't Attach when Custom condition",
		],
		[
			"an array with more than one quantifier stays custom",
			{
				filter: {
					incoming: { $every: { recurring: true }, $some: { plan_id: "pro" } },
				},
			},
			"Sales can Attach when Custom condition",
		],
		[
			"recurring discounts",
			{
				actions: attachUpdate,
				filter: {
					discounts: { $every: { percent_off: { $lte: 20 } } },
					incoming: { $every: { recurring: true } },
				},
			},
			"Sales can Attach Update subscription when Discount percent off ≤ 20% and Recurring is Yes",
		],
		[
			"OR groups on cancel with a refund cap",
			{
				subjects: [support],
				actions: ["billing.cancel"],
				filter: {
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
			"a refund cap only folds under allow",
			{
				effect: "block",
				subjects: [support],
				actions: ["billing.cancel"],
				filter: {
					$or: [{ refund: null }, { refund: { amount: { $lte: 50 } } }],
				},
			},
			"Support can't Cancel when Custom condition",
		],
		[
			"an $or that isn't a cap stays custom",
			{
				subjects: [support],
				actions: ["billing.cancel"],
				filter: {
					$or: [{ refund: null }, { cancel_action: "cancel_end_of_cycle" }],
					outgoing: { $every: { plan_id: "starter" } },
				},
			},
			"Support can Cancel when Custom condition and Plan is Starter",
		],
		[
			"an empty refund filter stays custom",
			{
				subjects: [support],
				actions: ["billing.cancel"],
				filter: { refund: {} },
			},
			"Support can Cancel when Custom condition",
		],
		[
			"grants above a limit, one person and their role",
			{
				effect: "block",
				subjects: [john],
				actions: ["balances.create"],
				filter: { feature_id: "ai_credits", included_grant: { $gt: 50 } },
			},
			"John Doe can't Grant credits when Feature is AI credits and Amount > 50 credits",
		],
		[
			"a range keeps both limits",
			{
				subjects: [everyone],
				actions: ["balances.create"],
				filter: {
					feature_id: "messages",
					included_grant: { $gte: 10, $lte: 100 },
				},
			},
			"Everyone can Grant credits when Feature is Messages and Amount ≥ 10 messages and Amount ≤ 100 messages",
		],
		[
			"set balance reads Included",
			{
				subjects: [everyone],
				actions: ["balances.update"],
				filter: { feature_id: "messages", included_grant: { $lte: 500 } },
			},
			"Everyone can Set balance when Feature is Messages and Included ≤ 500 messages",
		],
		[
			"checkout link",
			{ filter: { checkout: true } },
			"Sales can Attach when Sends checkout link is Yes",
		],
		[
			"plan schedule timing",
			{ filter: { plan_schedule: "end_of_cycle" } },
			"Sales can Attach when Timing is End of cycle",
		],
		[
			"an empty OR group stays custom",
			{ filter: { $or: [{}, { paid: true }] } },
			"Sales can Attach when Custom condition or Charges customer is Yes",
		],
		[
			"a null operand stays custom instead of reading as zero or No",
			{ filter: { total: { $ne: null }, paid: null } },
			"Sales can Attach when Custom condition and Custom condition",
		],
		[
			"a shape the list can't word yet",
			{ filter: { invoice_mode: { enabled: true } } },
			"Sales can Attach when Custom condition",
		],
	])("%s", (_name, input, expected) => {
		expect(textOf(input)).toBe(expected);
	});
});
