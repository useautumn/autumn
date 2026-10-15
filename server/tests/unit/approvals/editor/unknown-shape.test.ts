/**
 * S5 contract: a stored filter the editor can't show as rows returns
 * `{ editable: false }` and never throws.
 *
 * Red (before):  `whenToRows` doesn't exist.
 * Green (after): every shape below reads as not editable.
 */

import { describe, expect, test } from "bun:test";
import type { WhenKey } from "@autumn/shared";
import { whenToRows } from "@autumn/shared/api/approvals/editor/index.js";

const shapes: { name: string; area: WhenKey; when: unknown }[] = [
	{ name: "a string", area: "billing_change", when: "paid" },
	{ name: "an array", area: "billing_change", when: [{ paid: true }] },
	{ name: "$and", area: "billing_change", when: { $and: [{ paid: true }] } },
	{ name: "an unknown field", area: "billing_change", when: { colour: "red" } },
	{ name: "a field from another area", area: "invoice", when: { paid: true } },
	{
		name: "a pattern on an id",
		area: "billing_change",
		when: { customer: { customer_id: { $regex: "^acme" } } },
	},
	{
		name: "a bare array filter",
		area: "billing_change",
		when: { incoming: { plan_id: "pro" } },
	},
	{
		name: "$some on incoming plans",
		area: "billing_change",
		when: { incoming: { $some: { plan_id: "pro" } } },
	},
	{
		name: "an operator the row doesn't offer",
		area: "billing_change",
		when: { total: { $in: [10, 20] } },
	},
	{
		name: "a nested plan item filter",
		area: "billing_change",
		when: {
			outgoing: { $every: { item: { $every: { feature_id: "seats" } } } },
		},
	},
	{
		name: "a customer-level $or",
		area: "customer",
		when: { customer: { $or: [{ customer_id: "a" }, { customer_id: "b" }] } },
	},
	{
		name: "a refund $or that isn't a cap",
		area: "billing_cancel",
		when: { $or: [{ refund: null }, { refund: { amount: { $gt: 5 } } }] },
	},
	{
		name: "a who-only shape on a catalog area",
		area: "catalog_plan",
		when: { feature_id: "credits" },
	},
	{ name: "an empty $or", area: "billing_change", when: { $or: [] } },
];

describe("stored filters the editor can't show", () => {
	test.each(shapes)("$name", ({ area, when }) => {
		expect(() => whenToRows({ area, when })).not.toThrow();
		expect(whenToRows({ area, when })).toEqual({ editable: false });
	});

	test.each([null, {}])(
		"no conditions (%p) is editable with no rows",
		(when) => {
			expect(whenToRows({ area: "billing_change", when })).toEqual({
				editable: true,
				groups: [],
			});
		},
	);
});
