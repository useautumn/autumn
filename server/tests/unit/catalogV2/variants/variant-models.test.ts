/**
 * CatalogV2 variant data model — pointer, declare copy, preview, customize.
 *
 * Contract:
 *   Product.base_internal_product_id is null | string | omitted
 *   pointer-only change is a details write
 *   ProductUpsertIntent.baseInternalProductId is derive-owned
 *   declaredVariants copies on direct only
 *   preview variants[] accepts variant_action
 *   variants[].customize accepts items and upsert_licenses
 */

import { describe, expect, test } from "bun:test";
import {
	CatalogPlanUpdatePreviewSchema,
	CatalogVariantParamsSchema,
	CatalogVariantPreviewSchema,
	ProductSchema,
	productDetailsAreSame,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { declaredVariantsForSource } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/declaredVariantsForSource";

const pointerRow = (pointer: string | null) => ({
	...products.create({ id: "team-eu" }),
	base_internal_product_id: pointer,
});

describe("variant pointer", () => {
	test("Product parses null, a string, and a missing key", () => {
		const withNull = ProductSchema.parse(pointerRow(null));
		expect(withNull.base_internal_product_id).toBeNull();

		const withId = ProductSchema.parse(pointerRow("prod_team_v2"));
		expect(withId.base_internal_product_id).toBe("prod_team_v2");

		const { base_internal_product_id: _dropped, ...missing } = pointerRow(null);
		expect(ProductSchema.parse(missing).base_internal_product_id).toBeUndefined();
	});

	test("pointer move is a details change; null and omitted compare equal", () => {
		const current = pointerRow("prod_team_v1");
		const next = pointerRow("prod_team_v2");
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			false,
		);
		expect(
			productDetailsAreSame({
				product1: pointerRow(null),
				product2: products.create({ id: "team-eu" }),
			}),
		).toBe(true);
	});
});

describe("declaredVariants copy", () => {
	const variants = [{ variant_plan_id: "team-eu", name: "Team EU" }];

	test("direct keeps variants[]; siblings and other sources drop them", () => {
		expect(
			declaredVariantsForSource({ source: "direct", variants }),
		).toEqual(variants);
		expect(
			declaredVariantsForSource({ source: "all_versions", variants }),
		).toBeUndefined();
		expect(
			declaredVariantsForSource({
				source: "variant_propagation",
				variants,
			}),
		).toBeUndefined();
	});
});

describe("variant preview + params", () => {
	test("preview schema accepts variants with variant_action", () => {
		const parsed = CatalogVariantPreviewSchema.parse({
			plan_id: "team-eu",
			version: 2,
			version_slug: "v2",
			active: true,
deleted_at: null,
previous_version_slug: null,
			state: { has_customers: false, will_archive: false },
			variant_action: "propagated",
			sibling_versions: [
				{
					plan_id: "team-eu",
					version: 1,
					version_slug: "v1",
					active: false,
deleted_at: null,
previous_version_slug: null,
					state: { has_customers: false, will_archive: false },
					variant_action: "unchanged",
				},
			],
		});
		expect(parsed.variant_action).toBe("propagated");
		expect(parsed.sibling_versions?.[0]?.variant_action).toBe("unchanged");

		const plan = CatalogPlanUpdatePreviewSchema.parse({
			plan_id: "team",
			version: 1,
			version_slug: "v1",
			active: true,
deleted_at: null,
previous_version_slug: null,
			action: "update",
			state: { has_customers: false, will_archive: false },
			versioning: null,
			variants: [parsed],
		});
		expect(plan.variants).toHaveLength(1);
	});

	test("variants[].customize accepts items and upsert_licenses", () => {
		const base = { variant_plan_id: "team-eu", name: "Team EU" };
		expect(
			CatalogVariantParamsSchema.safeParse({
				...base,
				customize: { add_items: [{ feature_id: "dashboard" }] },
			}).success,
		).toBe(true);
		expect(
			CatalogVariantParamsSchema.safeParse({
				...base,
				customize: { upsert_licenses: [{ license_plan_id: "seat" }] },
			}).success,
		).toBe(true);
	});

	test("variants[] has no versioning field", () => {
		const parsed = CatalogVariantParamsSchema.parse({
			variant_plan_id: "team-eu",
			name: "Team EU",
			versioning: "new_version",
		});
		expect(parsed).not.toHaveProperty("versioning");
	});
});
