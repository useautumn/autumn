/** Contract: every When field of the invoice, reward, customer and catalog areas reads as a sentence, never "Custom condition". */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction, ApprovalRule, WhenKey } from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorRow,
	type EditorRowValue,
	rowsToWhen,
} from "@autumn/shared/api/approvals/editor/index";
import { buildRuleSentence } from "@/views/settings/sections/approvals/buildRuleSentence";

const AREAS: Partial<Record<WhenKey, ApprovalAction>> = {
	invoice: "invoices.create",
	reward_apply: "rewards.apply",
	customer: "customers.update",
	catalog_plan: "catalog.edit_plans",
	catalog_feature: "catalog.edit_features",
};

/** One value and a second for "any of" / "none of". */
const SAMPLES: Partial<Record<EditorField, EditorRowValue[]>> = {
	customer: ["acme", "globex"],
	customer_plan: [{ plan_id: "pro" }, { plan_id: "team", version: 2 }],
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
	plan: (id: string) => id,
	feature: (id: string) => ({ name: id, unit: "" }),
	money: (amount: number) => `$${amount}`,
	reward: (id: string) => id,
};

const cells = Object.entries(AREAS).flatMap(([area, action]) =>
	Object.entries(EDITOR_FIELDS[area as WhenKey]).flatMap(([field, operators]) =>
		(operators as readonly string[]).map((operator) => ({
			area: area as WhenKey,
			action: action as ApprovalAction,
			row: {
				field,
				operator,
				value: valueFor(field as EditorField, operator),
			} as EditorRow,
		})),
	),
);

describe("sentence field coverage", () => {
	test.each(cells)(
		"$area · $row.field $row.operator",
		({ area, action, row }) => {
			const stored = rowsToWhen({ area, groups: [[row]] });
			if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
			const rule = {
				id: "apr",
				name: "n",
				subjects: [{ type: "everyone" }],
				actions: [action],
				when: stored.when,
				note: null,
				enabled: true,
				version: 1,
				updated_by: { user_id: "u", name: "U" },
				created_at: 0,
				updated_at: 0,
			} as ApprovalRule;
			const values = buildRuleSentence({ rule, labels }).flatMap((part) =>
				part.kind === "condition" ? [part.value] : [],
			);
			expect(values.length).toBeGreaterThan(0);
			expect(values).not.toContain("Custom condition");
		},
	);
});
