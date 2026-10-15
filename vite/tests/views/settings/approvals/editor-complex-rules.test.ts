/**
 * Contract: each complex case in approvals-api-schema.md §4 (plus a checkout
 * rule) opens in the editor as rows and saves back to the same rule. A stored
 * `when` the rows can't rebuild opens read-only instead of throwing.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRule, CreateApprovalRuleParams } from "@autumn/shared";
import {
	editorValuesToParams,
	ruleToEditorValues,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";
import type { RuleRow } from "@/views/settings/sections/approvals/editor/ruleRowCodec";

const sales = { type: "role", role: "sales" } as const;
const attachUpdate = [
	"billing.attach",
	"billing.update_subscription",
] satisfies CreateApprovalRuleParams["actions"];

const CASES: {
	name: string;
	params: CreateApprovalRuleParams;
	rows: RuleRow[][];
}[] = [
	{
		name: "1 · Free trials only on Enterprise, under 2 months",
		params: {
			name: "Enterprise trials",
			subjects: [sales],
			actions: attachUpdate,
			when: {
				paid: false,
				incoming: {
					$every: {
						plan_id: "enterprise",
						$or: [
							{ free_trial: null },
							{
								free_trial: {
									duration_type: "day",
									duration_length: { $lt: 60 },
								},
							},
							{
								free_trial: {
									duration_type: "month",
									duration_length: { $lt: 2 },
								},
							},
							{
								free_trial: {
									duration_type: "year",
									duration_length: { $lt: 60 / 365 },
								},
							},
						],
					},
				},
			},
			note: "Sales can only give trials on Enterprise, up to 2 months.",
			enabled: true,
		},
		rows: [
			[
				{ field: "paid", operator: "is", values: ["false"] },
				{ field: "incoming_plan", operator: "is", values: ["enterprise"] },
				{ field: "free_trial", operator: "lt", values: ["2", "month"] },
			],
		],
	},
	{
		name: "2 · Discounts up to 20%, recurring plans only",
		params: {
			name: "Recurring discounts",
			subjects: [sales],
			actions: attachUpdate,
			when: {
				discounts: { $every: { percent_off: { $lte: 20 } } },
				incoming: { $every: { recurring: true } },
			},
			note: "Discounts over 20% need Finance.",
			enabled: true,
		},
		rows: [
			[
				{ field: "incoming_recurring", operator: "is", values: ["true"] },
				{ field: "discount_percent_off", operator: "lte", values: ["20"] },
			],
		],
	},
	{
		name: "3 · Cancel at end of cycle, or immediately for Starter with a small refund",
		params: {
			name: "Support cancellations",
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
			note: "Immediate cancels: Starter only, refunds up to $50.",
			enabled: true,
		},
		rows: [
			[
				{
					field: "cancel_action",
					operator: "is",
					values: ["cancel_end_of_cycle"],
				},
			],
			[
				{
					field: "cancel_action",
					operator: "is",
					values: ["cancel_immediately"],
				},
				{ field: "outgoing_plan", operator: "is", values: ["starter"] },
				{ field: "refund", operator: "lte", values: ["50"] },
			],
		],
	},
	{
		name: "4 · A tighter limit for one person than their role",
		params: {
			name: "John's credit grants",
			subjects: [{ type: "user", user_id: "usr_john" }],
			actions: ["balances.create"],
			when: { feature_id: "ai_credits", included_grant: { $lte: 50 } },
			note: "John can grant up to 50 AI credits. Ask an Admin for more.",
			enabled: true,
		},
		rows: [[{ field: "included_grant", operator: "lte", values: ["50"] }]],
	},
	{
		name: "Checkout links on Pro or Team",
		params: {
			name: "Checkout links",
			subjects: [sales],
			actions: ["billing.attach"],
			when: {
				checkout: true,
				incoming: { $every: { plan_id: { $in: ["pro", "team"] } } },
			},
			note: null,
			enabled: false,
		},
		rows: [
			[
				{ field: "checkout", operator: "is", values: ["true"] },
				{
					field: "incoming_plan",
					operator: "is_any_of",
					values: ["pro", "team"],
				},
			],
		],
	},
];

const storedRule = (params: CreateApprovalRuleParams): ApprovalRule => ({
	...params,
	when: params.when ?? null,
	note: params.note ?? null,
	enabled: params.enabled ?? true,
	id: "apr_test",
	version: 3,
	updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
});

describe("complex rules round-trip through the editor", () => {
	test.each(CASES)("$name", ({ params, rows }) => {
		const opened = ruleToEditorValues({ rule: storedRule(params) });
		expect(opened.editable).toBe(true);
		expect(opened.values.groups.map((group) => group.rules)).toEqual(rows);
		expect(editorValuesToParams({ values: opened.values })).toEqual({
			ok: true,
			params,
		});
	});

	test("case 4 pins the Feature row above the groups", () => {
		const [, , , john] = CASES;
		const { values } = ruleToEditorValues({ rule: storedRule(john.params) });
		expect(values.pinned).toEqual({
			field: "feature",
			operator: "is",
			values: ["ai_credits"],
		});
	});
});

describe("stored rules the editor can't show as rows", () => {
	test.each<[string, object]>([
		["a bare array filter", { incoming: { $some: { plan_id: "pro" } } }],
		["an unknown field", { paid: false, mystery: true }],
		[
			"a trial with no day branch",
			{
				incoming: {
					$every: { $or: [{ free_trial: { duration_type: "week" } }] },
				},
			},
		],
	])("%s opens read-only", (_label, when) => {
		const rule = storedRule({
			name: "Hand-written",
			subjects: [sales],
			actions: ["billing.attach"],
			when: when as unknown as CreateApprovalRuleParams["when"],
		});
		expect(ruleToEditorValues({ rule }).editable).toBe(false);
	});
});
