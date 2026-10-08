import { describe, expect, test } from "bun:test";
import type { Product } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { planParamsToProductRowPatch } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/planParamsToProductRowPatch";

const current = {
	...products.create({ id: "pro" }),
	config: { ignore_past_due: true, anchor_to_month_start: true },
} as Product;

describe("planParamsToProductRowPatch config", () => {
	test("omitted config leaves the row's config unmanaged", () => {
		const patch = planParamsToProductRowPatch({
			planParams: { plan_id: "pro" },
			current,
		});
		expect(patch.config).toBeUndefined();
	});

	test("an empty config turns every flag off", () => {
		const patch = planParamsToProductRowPatch({
			planParams: { plan_id: "pro", config: {} },
			current,
		});
		expect(patch.config).toEqual({
			ignore_past_due: false,
			anchor_to_month_start: false,
		});
	});

	test("a partial config turns the flags it omits off", () => {
		const patch = planParamsToProductRowPatch({
			planParams: { plan_id: "pro", config: { ignore_past_due: true } },
			current,
		});
		expect(patch.config).toEqual({
			ignore_past_due: true,
			anchor_to_month_start: false,
		});
	});
});
