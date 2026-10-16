/**
 * S2 contract: `planFilterMatchesProduct` supports base `price` and `item`
 * (feature_id, unlimited, price incl. billing_method, rollover, and the
 * $some / $every / $none quantifiers) with the SQL compiler's semantics.
 *
 * Red (before):  `price` and `item` throw "not supported in JS matcher yet".
 * Green (after): every row matches exactly its expected plans, and the SQL
 *                compiler encodes the same semantics (or rejects the shape).
 */

import { describe, expect, test } from "bun:test";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import { PLAN_NAMES, plans } from "./matcherFixtures";
import { expectSqlParity, PLAN_FILTER_CASES } from "./planFilterCases";

describe("planFilterMatchesProduct: price and item", () => {
	test.each(PLAN_FILTER_CASES)("$name", (testCase) => {
		const matched = PLAN_NAMES.filter((planName) =>
			planFilterMatchesProduct({
				filter: testCase.filter,
				product: plans[planName],
			}),
		);

		expect(matched).toEqual(testCase.matches);
		expectSqlParity({ testCase });
	});

	test("unsupported fields no longer throw", () => {
		expect(() =>
			planFilterMatchesProduct({
				filter: { price: {}, item: { unlimited: true } },
				product: plans.pro,
			}),
		).not.toThrow();
	});

	test("item feature_id reads the joined feature, not the optional copied id", () => {
		const { feature_id: _, ...messagesWithoutCopiedId } =
			plans.free.entitlements[0];
		const product = { ...plans.free, entitlements: [messagesWithoutCopiedId] };

		expect(
			planFilterMatchesProduct({
				filter: { item: { $some: { feature_id: "messages" } } },
				product,
			}),
		).toBe(true);
	});
});
