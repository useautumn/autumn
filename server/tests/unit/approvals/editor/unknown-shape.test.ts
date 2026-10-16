/**
 * S5 contract: a stored filter the editor can't show as rows returns
 * `{ editable: false }` and never throws.
 *
 * Red (before):  `ruleFilterToRows` doesn't exist.
 * Green (after): every shape below reads as not editable.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApprovalFilterKey,
	ruleFilterToRows,
} from "@autumn/shared/api/approvals/editor/index.js";

const filters: { name: string; shape: ApprovalFilterKey; filter: unknown }[] = [
	{ name: "a string", shape: "billing_change", filter: "paid" },
	{ name: "an array", shape: "billing_change", filter: [{ paid: true }] },
	{ name: "$and", shape: "billing_change", filter: { $and: [{ paid: true }] } },
	{
		name: "an unknown field",
		shape: "billing_change",
		filter: { colour: "red" },
	},
	{
		name: "a field from another shape",
		shape: "invoice",
		filter: { paid: true },
	},
	{
		name: "a pattern on an id",
		shape: "billing_change",
		filter: { customer: { customer_id: { $regex: "^acme" } } },
	},
	{
		name: "a bare array filter",
		shape: "billing_change",
		filter: { incoming: { customized: true } },
	},
	{
		name: "an operator the row doesn't offer",
		shape: "billing_change",
		filter: { total: { $in: [10, 20] } },
	},
	{
		name: "a nested plan item filter",
		shape: "billing_change",
		filter: {
			outgoing: { $every: { item: { $every: { feature_id: "seats" } } } },
		},
	},
	{
		name: "a customer-level $or",
		shape: "customer_change",
		filter: { customer: { $or: [{ customer_id: "a" }, { customer_id: "b" }] } },
	},
	{
		name: "a who-only shape on a catalog area",
		shape: "plan",
		filter: { feature_id: "credits" },
	},
	{ name: "an empty $or", shape: "billing_change", filter: { $or: [] } },
	{
		name: "a refund $or that isn't a cap",
		shape: "billing_cancel",
		filter: { $or: [{ refund: null }, { refund: { amount: { $gt: 5 } } }] },
	},
	{
		name: "Balances' Feature inside a group",
		shape: "balance_create",
		filter: { $or: [{ feature_id: "a" }, { feature_id: "b" }] },
	},
];

describe("stored filters the editor can't show", () => {
	test.each(filters)("$name", ({ shape, filter }) => {
		expect(() =>
			ruleFilterToRows({ shape, effect: "allow", filter }),
		).not.toThrow();
		expect(ruleFilterToRows({ shape, effect: "allow", filter })).toEqual({
			editable: false,
		});
	});

	test.each([null, {}])(
		"no conditions (%p) is editable with no rows",
		(filter) => {
			expect(
				ruleFilterToRows({ shape: "billing_change", effect: "block", filter }),
			).toEqual({ editable: true, pinned: null, groups: [] });
		},
	);
});
