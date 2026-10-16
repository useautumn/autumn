/**
 * S2 contract: `planFilterMatchesCustomerProduct` supports nested `price`
 * and `item` with the SQL compiler's semantics. The customer product is the
 * customer's instance of each fixture plan (same prices and entitlements), so
 * the same case table as the catalog matcher applies.
 *
 * Red (before):  nested `price` and any `item` throw "not supported in JS
 *                matcher yet".
 * Green (after): every row matches exactly its expected plans, and the SQL
 *                compiler encodes the same semantics (or rejects the shape).
 */

import { describe, expect, test } from "bun:test";
import { planFilterMatchesCustomerProduct } from "@autumn/shared/api/products/utils/match/index.js";
import { PLAN_NAMES, plans, planToCustomerProduct } from "./matcherFixtures";
import { expectSqlParity, PLAN_FILTER_CASES } from "./planFilterCases";

describe("planFilterMatchesCustomerProduct: price and item", () => {
	test.each(PLAN_FILTER_CASES)("$name", (testCase) => {
		const matched = PLAN_NAMES.filter((planName) =>
			planFilterMatchesCustomerProduct({
				filter: testCase.filter,
				cusProduct: planToCustomerProduct({ product: plans[planName] }),
			}),
		);

		expect(matched).toEqual(testCase.matches);
		expectSqlParity({ testCase });
	});

	test("item price follows the customer's prices, not the catalog's", () => {
		const cusProduct = planToCustomerProduct({ product: plans.pro });
		const withoutCreditsPrice = {
			...cusProduct,
			customer_prices: cusProduct.customer_prices.filter(
				(customerPrice) => customerPrice.price.entitlement_id !== "ent_credits",
			),
		};

		expect(
			planFilterMatchesCustomerProduct({
				filter: { item: { feature_id: "credits", price: null } },
				cusProduct: withoutCreditsPrice,
			}),
		).toBe(true);
	});

	test("license-linked customer products never match", () => {
		const cusProduct = {
			...planToCustomerProduct({ product: plans.pro }),
			customer_license_link_id: "link_1",
		};

		expect(
			planFilterMatchesCustomerProduct({
				filter: { item: { feature_id: "credits" } },
				cusProduct,
			}),
		).toBe(false);
	});
});
