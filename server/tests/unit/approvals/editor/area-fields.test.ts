/**
 * Contract: the invoice, reward, customer and catalog shapes offer exactly the
 * rows on the "When fields by area" board, and each row round-trips under
 * both effects (moved here from U7).
 */

import { describe, expect, test } from "bun:test";
import type {
	ApprovalFilterKey,
	ApprovalRuleEffect as RuleEffect,
} from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorRow,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const CUSTOMER_ROWS = {
	customer: ["is", "is_not", "is_any_of", "is_none_of"],
	customer_plan: ["has", "doesnt_have", "has_none"],
	customer_has_paid: ["is"],
};
const MONEY = ["eq", "ne", "lt", "lte", "gt", "gte"];
const ID = ["is", "is_not", "is_any_of", "is_none_of"];
const EFFECTS: RuleEffect[] = ["allow", "block"];

const BOARD: Partial<Record<ApprovalFilterKey, Record<string, string[]>>> = {
	invoice: { ...CUSTOMER_ROWS, total: MONEY, refund: MONEY },
	reward_redeem: { ...CUSTOMER_ROWS, reward: ID },
	customer_change: CUSTOMER_ROWS,
	plan: { plan: ID },
	feature: { feature: ID },
};

const CASES: [ApprovalFilterKey, string, string, unknown, unknown][] = [
	["invoice", "total", "lte", 100, { total: { $lte: 100 } }],
	[
		"reward_redeem",
		"reward",
		"is_none_of",
		["launch20"],
		{ reward_id: { $nin: ["launch20"] } },
	],
	["plan", "plan", "is", "enterprise", { plan_id: "enterprise" }],
	[
		"feature",
		"feature",
		"is_any_of",
		["ai_credits", "messages"],
		{ feature_id: { $in: ["ai_credits", "messages"] } },
	],
	[
		"customer_change",
		"customer",
		"is",
		"acme",
		{ customer: { customer_id: "acme" } },
	],
];

describe("shape fields match the board", () => {
	test.each(Object.entries(BOARD))("%s", (shape, rows) => {
		expect<unknown>(EDITOR_FIELDS[shape as ApprovalFilterKey]).toEqual(rows);
	});

	test.each(
		EFFECTS.flatMap((effect) => CASES.map((c) => [effect, ...c] as const)),
	)(
		"%s · %s · %s %s round-trips",
		(effect, shape, field, operator, value, filter) => {
			const row = { field, operator, value } as EditorRow;
			expect<unknown>(
				ruleRowsToFilter({ shape, effect, groups: [[row]] }),
			).toEqual({ ok: true, filter });
			expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
				editable: true,
				pinned: null,
				groups: [[row]],
			});
		},
	);
});
