/**
 * S2 contract: `customerFilterMatchesFullCustomer` supports the `item`
 * shorthand, which is sugar for `plan: { item }`: some relevant-status plan
 * has items satisfying the item filter (its own quantifier applies within
 * that plan). Mirrors `parseCustomerFilter`, which wraps `item` in a `$some`
 * plan nav.
 *
 * Red (before):  `item` throws "not supported in JS matcher yet".
 * Green (after): `item` ≡ `plan: { item }` in memory, the SQL compiler emits
 *                identical SQL for both spellings (or rejects both alike), and
 *                each row matches exactly its expected customers.
 */

import { describe, expect, test } from "bun:test";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { type CustomerName, matchingCustomers } from "./matcherFixtures";
import { compileCustomerFilter } from "./planFilterCases";

const ITEM_CASES: {
	name: string;
	item: NonNullable<CustomerFilter["item"]>;
	matches: CustomerName[];
}[] = [
	{
		name: "feature_id (expired plans ignored)",
		item: { feature_id: "credits" },
		matches: ["paying"],
	},
	{
		name: "paid item",
		item: { price: { $ne: null } },
		matches: ["paying", "unlimited"],
	},
	{
		name: "free item",
		item: { price: null },
		matches: ["downgraded", "unlimited"],
	},
	{
		name: "rollover item",
		item: { rollover: { $ne: null } },
		matches: ["paying"],
	},
	{
		name: "unlimited item",
		item: { unlimited: true },
		matches: ["unlimited"],
	},
	{
		name: "prepaid item",
		item: { price: { billing_method: "prepaid" } },
		matches: ["paying"],
	},
	{
		name: "$none paid: some plan has no paid item",
		item: { $none: { price: { $ne: null } } },
		matches: ["downgraded"],
	},
	{
		name: "$every free: some plan has only free items",
		item: { $every: { price: null } },
		matches: ["downgraded"],
	},
];

describe("customerFilterMatchesFullCustomer: item shorthand", () => {
	test.each(ITEM_CASES)("$name", ({ item, matches }) => {
		const shorthand = matchingCustomers({ filter: { item } });
		const explicit = matchingCustomers({ filter: { plan: { item } } });

		expect(shorthand).toEqual(matches);
		expect(explicit).toEqual(matches);

		const compileShorthand = () => compileCustomerFilter({ filter: { item } });
		const compileExplicit = () =>
			compileCustomerFilter({ filter: { plan: { item } } });

		let explicitError: unknown;
		try {
			compileExplicit();
		} catch (error) {
			explicitError = error;
		}

		if (explicitError instanceof Error) {
			expect(compileShorthand).toThrow(explicitError.message);
			return;
		}
		expect(compileShorthand()).toEqual(compileExplicit());
	});

	test("item sibling of plan ANDs two independent plan checks", () => {
		expect(
			matchingCustomers({
				filter: { plan: { plan_id: "free" }, item: { feature_id: "messages" } },
			}),
		).toEqual(["downgraded"]);

		// Credits only live on the expired pro plan, so the item check fails.
		expect(
			matchingCustomers({
				filter: { plan: { plan_id: "free" }, item: { feature_id: "credits" } },
			}),
		).toEqual([]);
	});
});
