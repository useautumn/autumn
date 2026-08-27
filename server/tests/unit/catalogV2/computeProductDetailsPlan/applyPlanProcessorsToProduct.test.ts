/**
 * applyPlanProcessorsToProduct — stamp plan.processors.stripe onto product.processor.
 *
 * Omit / processors.stripe omitted → keep. Object → set. Same id → unchanged.
 */

import { describe, expect, test } from "bun:test";
import type { Product } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { applyPlanProcessorsToProduct } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/applyPlanProcessorsToProduct";

const row = (overrides: Partial<Product> = {}): Product =>
	({ ...products.create({ id: "pro" }), ...overrides }) as Product;

describe("applyPlanProcessorsToProduct", () => {
	test("omit keeps the existing processor", () => {
		const product = row({
			processor: { type: "stripe", id: "prod_existing" },
		});
		expect(applyPlanProcessorsToProduct({ product })).toEqual({
			product,
			changed: false,
		});
		expect(applyPlanProcessorsToProduct({ product, processors: {} })).toEqual({
			product,
			changed: false,
		});
	});

	test("stripe object stamps id and additional ids", () => {
		const product = row({ processor: null });
		const { product: next, changed } = applyPlanProcessorsToProduct({
			product,
			processors: {
				stripe: {
					product_id: "prod_abc",
					additional_product_ids: ["prod_alias"],
				},
			},
		});
		expect(changed).toBe(true);
		expect(next.processor).toEqual({
			type: "stripe",
			id: "prod_abc",
			additional_ids: ["prod_alias"],
		});
	});

	test("reordered additional ids are not a change", () => {
		const product = row({
			processor: {
				type: "stripe",
				id: "prod_abc",
				additional_ids: ["prod_alias_a", "prod_alias_b"],
			},
		});
		expect(
			applyPlanProcessorsToProduct({
				product,
				processors: {
					stripe: {
						product_id: "prod_abc",
						additional_product_ids: ["prod_alias_b", "prod_alias_a"],
					},
				},
			}).changed,
		).toBe(false);
	});

	test("a different additional id set is a change", () => {
		const product = row({
			processor: {
				type: "stripe",
				id: "prod_abc",
				additional_ids: ["prod_alias_a"],
			},
		});
		expect(
			applyPlanProcessorsToProduct({
				product,
				processors: {
					stripe: {
						product_id: "prod_abc",
						additional_product_ids: ["prod_alias_b"],
					},
				},
			}).changed,
		).toBe(true);
	});

	test("same id is not a change", () => {
		const product = row({
			processor: { type: "stripe", id: "prod_abc" },
		});
		expect(
			applyPlanProcessorsToProduct({
				product,
				processors: { stripe: { product_id: "prod_abc" } },
			}),
		).toEqual({ product, changed: false });
	});
});
