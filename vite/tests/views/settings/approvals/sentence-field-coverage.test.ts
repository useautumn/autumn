/** Contract: every editor row of the invoice, reward, customer and catalog areas, plus has-paid, reads as a sentence for both effects, never "Custom condition". */

import { describe, expect, test } from "bun:test";
import type {
	ApprovalAction,
	ApprovalFilterKey,
	ApprovalRule,
	ApprovalRuleEffect,
	ApprovalRuleFilter,
} from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorRow,
	type EditorRowValue,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index";
import { buildRuleSentence } from "@/views/settings/sections/approvals/buildRuleSentence";

const AREAS: Partial<Record<ApprovalFilterKey, ApprovalAction>> = {
	invoice: "invoices.create",
	reward_redeem: "rewards.redeem",
	customer_change: "customers.update",
	plan: "plans.update",
	feature: "features.update",
};

/** One value and a second for "any of" / "none of". */
const SAMPLES: Partial<Record<EditorField, EditorRowValue[]>> = {
	customer: ["acme", "globex"],
	customer_plan: [{ plan_id: "pro" }, { plan_id: "team", version: 2 }],
	customer_has_paid: [true],
	total: [100],
	refund: [50],
	reward: ["launch20", "partner"],
	plan: ["pro", "team"],
	feature: ["ai_credits", "messages"],
};

const valueFor = (field: EditorField, operator: string): EditorRowValue => {
	const [one, two] = SAMPLES[field] ?? [];
	if (operator === "has_none") return null;
	return operator.endsWith("_of")
		? ([one, two] as EditorRowValue)
		: (one ?? null);
};

const labels = {
	member: (id: string) => id,
	role: (id: string) => id,
	plan: (id: string) => id,
	feature: (id: string) => ({ name: id, unit: "" }),
	money: (amount: number) => `$${amount}`,
	reward: (id: string) => id,
};

const EFFECTS: ApprovalRuleEffect[] = ["allow", "block"];

const cells = EFFECTS.flatMap((effect) =>
	Object.entries(AREAS).flatMap(([shape, action]) =>
		Object.entries(EDITOR_FIELDS[shape as ApprovalFilterKey]).flatMap(
			([field, operators]) =>
				(operators as readonly string[]).map((operator) => ({
					name: `${effect} ${shape}.${field} ${operator}`,
					effect,
					shape: shape as ApprovalFilterKey,
					action: action as ApprovalAction,
					row: {
						field,
						operator,
						value: valueFor(field as EditorField, operator),
					} as EditorRow,
				})),
		),
	),
);

const sentence = ({
	effect,
	action,
	filter,
}: {
	effect: ApprovalRuleEffect;
	action: ApprovalAction;
	filter: unknown;
}) =>
	buildRuleSentence({
		rule: {
			id: "apr_1",
			name: "Rule",
			effect,
			position: 0,
			subjects: [{ type: "everyone" }],
			actions: [action],
			filter: filter as ApprovalRuleFilter,
			note: null,
			enabled: true,
			version: 1,
			updated_by: { user_id: "usr_1", name: "Charlie" },
			created_at: 0,
			updated_at: 0,
		} satisfies ApprovalRule,
		labels,
	});

describe("area fields read as sentences", () => {
	test.each(cells)("$name", ({ effect, shape, action, row }) => {
		const stored = ruleRowsToFilter({ shape, effect, groups: [[row]] });
		if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
		const conditions = sentence({
			effect,
			action,
			filter: stored.filter,
		}).filter((part) => part.kind === "condition");
		expect(conditions.length).toBeGreaterThan(0);
		for (const condition of conditions) {
			expect(condition.value).not.toBe("Custom condition");
		}
	});

	test.each(EFFECTS)("%s: customer has paid before reads Yes", (effect) => {
		const stored = ruleRowsToFilter({
			shape: "billing_change",
			effect,
			groups: [[{ field: "customer_has_paid", operator: "is", value: true }]],
		});
		if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
		const condition = sentence({
			effect,
			action: "billing.attach",
			filter: stored.filter,
		}).find((part) => part.kind === "condition");
		expect(condition).toMatchObject({
			field: "Customer has paid before",
			value: "Yes",
		});
	});
});
