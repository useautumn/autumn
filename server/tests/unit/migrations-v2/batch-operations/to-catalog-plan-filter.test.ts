/**
 * Contract: `toCatalogPlanFilter` keeps only catalog-decidable fields, so
 * migration prep covers every plan a customer instance could match.
 *
 * Red (before):  `item` survives, so prep's catalog match throws on an
 *                item-filtered `update_plan`.
 * Green (after): `item` is stripped at every `$or` depth; plan fields stay.
 */

import { describe, expect, test } from "bun:test";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import { products } from "@tests/utils/fixtures/db/products";
import { toCatalogPlanFilter } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

const pro = products.createFull({ id: "pro" });

describe("toCatalogPlanFilter", () => {
	test("strips item, keeping catalog fields", () => {
		expect(
			toCatalogPlanFilter({ plan_id: "pro", item: { feature_id: "credits" } }),
		).toEqual({ plan_id: "pro" });
	});

	test("strips item inside $or branches", () => {
		expect(
			toCatalogPlanFilter({
				$or: [{ plan_id: "pro", item: { $some: { feature_id: "x" } } }],
			}),
		).toEqual({ $or: [{ plan_id: "pro" }] });
	});

	test("an item-filtered update_plan matches its catalog plan during prep", () => {
		const filter = toCatalogPlanFilter({
			plan_id: "pro",
			item: { feature_id: "custom_only_feature" },
		});
		expect(planFilterMatchesProduct({ filter, product: pro })).toBe(true);
	});
});
