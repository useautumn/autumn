/**
 * Contract: each PRD §8 example opens in the editor as rows and saves back to the
 * same rule; switching the effect re-quantifies the rows; hand-written filters open read-only.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleCreateParams } from "@/hooks/queries/useApprovalRulesApi";
import type { ApprovalRule } from "@/views/settings/sections/approvals/approvalsStub";
import {
	editorValuesToParams,
	ruleToEditorValues,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";
import type { RuleRow } from "@/views/settings/sections/approvals/editor/ruleRowCodec";

const sales = { type: "role", role_id: "sales" } as const;

const asRule = (params: ApprovalRuleCreateParams): ApprovalRule => ({
	...params,
	id: "apr_1",
	position: 1,
	version: 1,
	updated_by: { user_id: "usr_1", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
});

const rule = ({
	name,
	effect,
	actions,
	filter,
}: Pick<ApprovalRuleCreateParams, "name" | "effect" | "actions" | "filter">) =>
	asRule({
		name,
		effect,
		subjects: [sales],
		actions,
		filter,
		note: null,
		enabled: true,
	});

const enterpriseTrials = rule({
	name: "A · Sales: Enterprise trials",
	effect: "allow",
	actions: ["billing.attach", "billing.update"],
	filter: {
		paid: false,
		incoming: {
			$every: {
				plan_id: "enterprise",
				free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
			},
		},
	},
});

const CASES: { rule: ApprovalRule; rows: RuleRow[][] }[] = [
	{
		rule: enterpriseTrials,
		rows: [
			[
				{ field: "paid", operator: "is", values: ["false"] },
				{ field: "incoming_plan", operator: "is", values: ["enterprise"] },
				{ field: "free_trial", operator: "lt", values: ["2", "month"] },
			],
		],
	},
	{
		rule: rule({
			name: "B · Credit add-ons on the customer",
			effect: "block",
			actions: ["billing.attach"],
			filter: {
				incoming: { $some: { plan_id: "credits_addon" } },
				entity: { $ne: null },
			},
		}),
		rows: [
			[
				{ field: "entity", operator: "is_entity", values: [] },
				{ field: "incoming_plan", operator: "is", values: ["credits_addon"] },
			],
		],
	},
	{
		rule: rule({
			name: "D · No Enterprise cancels",
			effect: "block",
			actions: ["billing.cancel"],
			filter: { outgoing: { $some: { plan_id: "enterprise" } } },
		}),
		rows: [
			[{ field: "outgoing_plan", operator: "is", values: ["enterprise"] }],
		],
	},
	{
		rule: rule({
			name: "E · Trials for new customers only",
			effect: "block",
			actions: ["billing.attach"],
			filter: {
				customer: { has_paid: true },
				incoming: {
					$some: { plan_id: "enterprise", free_trial: { $ne: null } },
				},
			},
		}),
		rows: [
			[
				{ field: "customer_has_paid", operator: "is", values: ["true"] },
				{ field: "incoming_plan", operator: "is", values: ["enterprise"] },
				{ field: "free_trial", operator: "has_any", values: [] },
			],
		],
	},
	{
		rule: rule({
			name: "F · Sales: no custom pricing",
			effect: "block",
			actions: ["billing.attach", "billing.update"],
			filter: { incoming: { $some: { customized: true } } },
		}),
		rows: [[{ field: "customized", operator: "is", values: ["true"] }]],
	},
];

const rowsOf = (groups: { rules: (RuleRow & { id: string })[] }[]) =>
	groups.map((group) => group.rules.map(({ id: _id, ...row }) => row));

describe("PRD §8 rules in the editor", () => {
	test.each(CASES)("$rule.name round-trips", ({ rule, rows }) => {
		const opened = ruleToEditorValues({ rule });
		expect(opened.editable).toBe(true);
		expect(rowsOf(opened.values.groups)).toEqual(rows);

		const saved = editorValuesToParams({ values: opened.values });
		if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
		expect(saved.params.filter).toEqual(rule.filter);
		expect(saved.params.effect).toBe(rule.effect);
	});

	test("switching an allow to can't stores the block quantifier", () => {
		const { values } = ruleToEditorValues({ rule: enterpriseTrials });
		const saved = editorValuesToParams({
			values: { ...values, effect: "block" },
		});
		if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
		expect(saved.params.filter).toEqual({
			paid: false,
			incoming: {
				$some: {
					plan_id: "enterprise",
					free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
				},
			},
		});
	});

	test.each([
		rule({
			name: "C · Plans on deployments, hand-written",
			effect: "block",
			actions: ["billing.attach"],
			filter: {
				incoming: {
					$some: { plan_id: { $in: ["pro", "enterprise", "hobby"] } },
				},
				$or: [
					{ entity: null },
					{ entity: { feature_id: { $ne: "deployments" } } },
				],
			},
		}),
		rule({
			name: "D · Enterprise cancels allowed with $some",
			effect: "allow",
			actions: ["billing.cancel"],
			filter: { outgoing: { $some: { plan_id: "enterprise" } } },
		}),
	])("$name opens read-only", (rule) => {
		expect(ruleToEditorValues({ rule }).editable).toBe(false);
	});
});
