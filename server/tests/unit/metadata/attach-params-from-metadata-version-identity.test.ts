/**
 * invoice.paid reconstitutes AttachParams from metadata snapshotted before
 * version_slug/active existed. LineItemSchema then ZodErrors on those keys.
 *
 * Schema defaults make parse a no-throw. Hydrate still fills v{version} / false
 * so snapshots don't persist null slug into line-item context.
 */

import { describe, expect, test } from "bun:test";
import { LineItemSchema, ProductSchema } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { attachParamsFromMetadataData } from "@/internal/metadata/utils/attachParamsFromMetadataData.js";
import { backfillProductVersionIdentityInTree } from "@/internal/products/productUtils/backfillProductVersionIdentity.js";

const staleProduct = ({ version = 1 }: { version?: number } = {}) => {
	const { version_slug: _slug, active: _active, ...rest } = products.create({
		id: "credit",
	});
	return { ...rest, version };
};

const lineItemWithStaleProduct = (product: unknown) => ({
	id: "invoice_li_test",
	amount: 10,
	description: "Credit",
	context: {
		price: prices.createFixed({ id: "price_credit" }),
		product,
		currency: "usd",
		direction: "charge" as const,
		now: 1,
		billingTiming: "in_advance" as const,
	},
});

describe("attachParamsFromMetadataData — version identity backfill", () => {
	test("ProductSchema / LineItemSchema parse pre-migration products (no throw)", () => {
		const product = staleProduct();
		const parsed = ProductSchema.parse(product);
		expect(parsed.version_slug).toBeNull();
		expect(parsed.active).toBe(false);

		const lineItem = LineItemSchema.safeParse(lineItemWithStaleProduct(product));
		expect(lineItem.success).toBe(true);
		if (lineItem.success) {
			expect(lineItem.data.context.product.version_slug).toBeNull();
			expect(lineItem.data.context.product.active).toBe(false);
		}
	});

	test("hydrates products[] and nested cusProduct.product so ProductSchema accepts them", () => {
		const product = staleProduct({ version: 1 });
		const nested = staleProduct({ version: 3 });
		const customerNested = staleProduct({ version: 2 });

		const data = {
			products: [product],
			cusProducts: [{ product: nested }],
			cusProduct: { product: nested },
			customer: {
				customer_products: [{ product: customerNested }],
			},
		};

		const attachParams = attachParamsFromMetadataData({ data });

		expect(ProductSchema.parse(attachParams.products[0]).version_slug).toBe(
			"v1",
		);
		expect(ProductSchema.parse(attachParams.products[0]).active).toBe(false);
		expect(
			ProductSchema.parse(attachParams.cusProducts[0].product).version_slug,
		).toBe("v3");
		expect(
			ProductSchema.parse(attachParams.cusProduct?.product).version_slug,
		).toBe("v3");
		expect(
			ProductSchema.parse(
				attachParams.customer.customer_products[0].product,
			).version_slug,
		).toBe("v2");
	});

	test("does not overwrite real version_slug / active from post-migration snapshots", () => {
		const product = products.create({ id: "credit" });
		const attachParams = attachParamsFromMetadataData({
			data: { products: [product], cusProducts: [] },
		});

		expect(attachParams.products[0].version_slug).toBe("v1");
		expect(attachParams.products[0].active).toBe(true);
	});

	test("passes through explicit null version_slug (only undefined is filled)", () => {
		const product = { ...products.create({ id: "credit" }), version_slug: null };
		const attachParams = attachParamsFromMetadataData({
			data: { products: [product], cusProducts: [] },
		});

		expect(attachParams.products[0].version_slug).toBeNull();
	});

	test("tree-walk fills v2 metadata nests AttachParams hydrate misses", () => {
		const data = {
			billingContext: { fullProducts: [staleProduct({ version: 5 })] },
			insertCustomerProducts: [{ product: staleProduct({ version: 2 }) }],
			lineItems: [
				lineItemWithStaleProduct(staleProduct({ version: 4 })),
			],
		};

		backfillProductVersionIdentityInTree({ value: data });

		expect(
			ProductSchema.parse(data.billingContext.fullProducts[0]).version_slug,
		).toBe("v5");
		expect(
			ProductSchema.parse(data.insertCustomerProducts[0].product).version_slug,
		).toBe("v2");
		const lineItem = LineItemSchema.parse(data.lineItems[0]);
		expect(lineItem.context.product.version_slug).toBe("v4");
		expect(lineItem.context.product.active).toBe(false);
	});
});
