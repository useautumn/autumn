/**
 * S5 contract: the stored quantifier follows the rule's effect. Block rules
 * store `$some` ("something in the request is this"), allow rules `$every`
 * ("everything in it is within this"). A filter whose quantifier doesn't match
 * its effect opens read-only.
 *
 * Red (before):  no `effect` param; incoming plan and discount rows always store `$every`.
 * Green (after): each case stores and reads back as listed.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleEffect as RuleEffect } from "@autumn/shared";
import {
	type EditorRow,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const shape = "billing_change";
const customized: EditorRow = {
	field: "customized",
	operator: "is",
	value: true,
};
const paidPlan: EditorRow = {
	field: "incoming_paid",
	operator: "is",
	value: true,
};

const expectRoundTrip = ({
	effect,
	rows,
	filter,
}: {
	effect: RuleEffect;
	rows: EditorRow[];
	filter: unknown;
}) => {
	expect<unknown>(ruleRowsToFilter({ shape, effect, groups: [rows] })).toEqual({
		ok: true,
		filter,
	});
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		pinned: null,
		groups: [rows],
	});
};

describe("the quantifier follows the effect", () => {
	test.each<{
		name: string;
		effect: RuleEffect;
		rows: EditorRow[];
		filter: unknown;
	}>([
		{
			name: "block stores incoming plan conditions under $some",
			effect: "block",
			rows: [customized],
			filter: { incoming: { $some: { customized: true } } },
		},
		{
			name: "allow stores incoming plan conditions under $every",
			effect: "allow",
			rows: [customized],
			filter: { incoming: { $every: { customized: true } } },
		},
		{
			name: "block: rows on different plan fields share one $some element",
			effect: "block",
			rows: [paidPlan, customized],
			filter: { incoming: { $some: { paid: true, customized: true } } },
		},
		{
			name: "allow: rows on different plan fields share one $every element",
			effect: "allow",
			rows: [paidPlan, customized],
			filter: { incoming: { $every: { paid: true, customized: true } } },
		},
		{
			name: "block: discount percent off > 20 stores discounts.$some",
			effect: "block",
			rows: [{ field: "discount_percent_off", operator: "gt", value: 20 }],
			filter: { discounts: { $some: { percent_off: { $gt: 20 } } } },
		},
		{
			name: "allow: discount percent off ≤ 20 stores discounts.$every",
			effect: "allow",
			rows: [{ field: "discount_percent_off", operator: "lte", value: 20 }],
			filter: { discounts: { $every: { percent_off: { $lte: 20 } } } },
		},
	])("$name", expectRoundTrip);

	test.each<RuleEffect>(["allow", "block"])(
		"%s: the same Customer has plan field twice stays two separate checks",
		(effect) =>
			expectRoundTrip({
				effect,
				rows: [
					{ field: "customer_plan", operator: "has", value: { plan_id: "a" } },
					{ field: "customer_plan", operator: "has", value: { plan_id: "b" } },
				],
				filter: {
					customer: { plan: { $some: { plan_id: "a" } } },
					$and: [{ customer: { plan: { $some: { plan_id: "b" } } } }],
				},
			}),
	);
});

describe("a quantifier that doesn't match the effect opens read-only", () => {
	test.each<{ name: string; effect: RuleEffect; filter: unknown }>([
		{
			name: "an allow rule with a stored $some",
			effect: "allow",
			filter: { incoming: { $some: { customized: true } } },
		},
		{
			name: "a block rule with a stored $every",
			effect: "block",
			filter: { incoming: { $every: { customized: true } } },
		},
		{
			name: "a block rule with a stored discounts.$every",
			effect: "block",
			filter: { discounts: { $every: { percent_off: { $lte: 20 } } } },
		},
	])("$name", ({ effect, filter }) => {
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: false,
		});
	});
});

test("switching the effect re-encodes the same rows", () => {
	const rows = [paidPlan, customized];
	const allow = ruleRowsToFilter({ shape, effect: "allow", groups: [rows] });
	if (!allow.ok) throw new Error(JSON.stringify(allow.issues));
	const read = ruleFilterToRows({
		shape,
		effect: "allow",
		filter: allow.filter,
	});
	if (!read.editable) throw new Error("not editable");
	expect<unknown>(
		ruleRowsToFilter({ shape, effect: "block", groups: read.groups }),
	).toEqual({
		ok: true,
		filter: { incoming: { $some: { paid: true, customized: true } } },
	});
});
