import { describe, expect, test } from "bun:test";
import {
	type Product,
	ProductConfigSchema,
	productDetailsAreSame,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { diffProductDetails } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/diffProductDetails";
import { planParamsToProductRowPatch } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/planParamsToProductRowPatch";

const row = (overrides: Partial<Product> = {}): Product =>
	({ ...products.create({ id: "pro" }), ...overrides }) as Product;

describe("productDetailsAreSame / diffProductDetails", () => {
	test("identical rows are same, diff is empty", () => {
		const current = row();
		const next = row();
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			true,
		);
		expect(diffProductDetails({ current, next })).toEqual({});
	});

	test("scalar change diffs with previous value", () => {
		const current = row({ name: "Pro" });
		const next = row({ name: "Pro v2", is_add_on: true });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			false,
		);
		expect(diffProductDetails({ current, next })).toEqual({
			name: "Pro",
			is_add_on: false,
		});
	});

	test("metadata key order does not diff", () => {
		const current = row({ metadata: { a: 1, b: 2 } });
		const next = row({ metadata: { b: 2, a: 1 } });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			true,
		);
		expect(diffProductDetails({ current, next })).toEqual({});
	});

	test("config change diffs via explicit comparator", () => {
		const current = row({ config: { ignore_past_due: false } });
		const next = row({ config: { ignore_past_due: true } });
		expect(diffProductDetails({ current, next })).toEqual({
			config: { ignore_past_due: false },
		});
	});

	test("overdue access and cancellation flags patch independently", () => {
		const current = row({ config: { ignore_past_due: true } });
		const planParams = UpdateCatalogPlanParamsSchema.parse({
			plan_id: current.id,
			config: { allow_overdue_entitlements: true },
		});
		expect(planParams.config).toEqual({ allow_overdue_entitlements: true });
		const next = {
			...current,
			...planParamsToProductRowPatch({ current, planParams }),
		};
		expect(next.config).toEqual({
			ignore_past_due: true,
			allow_overdue_entitlements: true,
		});
		expect(diffProductDetails({ current, next })).toEqual({
			config: current.config,
		});
		const cancellationPatch = planParamsToProductRowPatch({
			current: next,
			planParams: UpdateCatalogPlanParamsSchema.parse({
				plan_id: current.id,
				config: { ignore_past_due: false },
			}),
		});
		expect(cancellationPatch.config).toEqual({
			ignore_past_due: false,
			allow_overdue_entitlements: true,
		});
		expect(ProductConfigSchema.parse({}).allow_overdue_entitlements).toBe(
			false,
		);
	});

	test("pointer-only change diffs", () => {
		const current = row({ base_internal_product_id: "prod_team_v1" });
		const next = row({ base_internal_product_id: "prod_team_v2" });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			false,
		);
		expect(diffProductDetails({ current, next })).toEqual({
			base_internal_product_id: "prod_team_v1",
		});
	});

	test("active change diffs with previous value", () => {
		const current = row({ active: false });
		const next = row({ active: true });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			false,
		);
		expect(diffProductDetails({ current, next })).toEqual({
			active: false,
		});
	});

	test("version_slug change diffs with previous value", () => {
		const current = row({ version_slug: "v1" });
		const next = row({ version_slug: "summer" });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			false,
		);
		expect(diffProductDetails({ current, next })).toEqual({
			version_slug: "v1",
		});
	});

	test("description nullish-normalizes", () => {
		const current = row({ description: null });
		const next = row({ description: undefined as unknown as null });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			true,
		);
	});

	test("processor is not a product-detail key", () => {
		const current = row({ processor: { type: "stripe", id: "prod_old" } });
		const next = row({ processor: { type: "stripe", id: "prod_new" } });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			true,
		);
		expect(diffProductDetails({ current, next })).toEqual({});
	});
});
