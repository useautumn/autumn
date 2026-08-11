import { describe, expect, test } from "bun:test";
import { type Product, productDetailsAreSame } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { diffProductDetails } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/diffProductDetails";

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

	test("description nullish-normalizes", () => {
		const current = row({ description: null });
		const next = row({ description: undefined as unknown as null });
		expect(productDetailsAreSame({ product1: current, product2: next })).toBe(
			true,
		);
	});
});
