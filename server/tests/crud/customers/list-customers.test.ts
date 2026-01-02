import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "list-customers";

const productV1 = constructProduct({
	id: `${testCase}-product-v1`,
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
	],
});

const productV2 = constructProduct({
	id: `${testCase}-product-v2`,
	type: "free",
	isDefault: false,
	version: 2,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
			interval: ProductItemInterval.Month,
		}),
	],
});

const otherProduct = constructProduct({
	id: `${testCase}-other-product`,
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
	],
});

const customerIds = {
	withProductV1: `${testCase}-cus-v1`,
	withProductV2: `${testCase}-cus-v2`,
	withOtherProduct: `${testCase}-cus-other`,
	noProducts: `${testCase}-cus-none`,
	searchable: `${testCase}-searchable-john`,
};

describe(`${chalk.yellowBright("list-customers: Testing list customers endpoint")}`, () => {
	const autumn = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		// Create products
		await initProductsV0({
			ctx,
			products: [productV1, productV2, otherProduct],
			prefix: "",
			customerId: customerIds.withProductV1,
		});

		// Create customers
		for (const customerId of Object.values(customerIds)) {
			await initCustomerV3({
				ctx,
				customerId,
				withTestClock: false,
				withDefault: false,
			});
		}

		// Attach products to customers
		await autumn.attach({
			customer_id: customerIds.withProductV1,
			product_id: productV1.id,
		});

		await autumn.attach({
			customer_id: customerIds.withProductV2,
			product_id: productV2.id,
		});

		await autumn.attach({
			customer_id: customerIds.withOtherProduct,
			product_id: otherProduct.id,
		});

		// Attach product to searchable customer so it's not filtered out by default status
		await autumn.attach({
			customer_id: customerIds.searchable,
			product_id: productV1.id,
		});
	});

	// Pagination Tests
	describe("pagination", () => {
		test("should return customers with default pagination", async () => {
			const result = await autumn.customers.list();

			expect(result.list).toBeDefined();
			expect(Array.isArray(result.list)).toBe(true);
			expect(result.limit).toBe(10);
			expect(result.offset).toBe(0);
			expect(typeof result.total).toBe("number");
		});

		test("should respect custom limit", async () => {
			const result = await autumn.customers.list({ limit: 20 });

			expect(result.limit).toBe(20);
		});

		test("should respect offset", async () => {
			const result = await autumn.customers.list({ offset: 5 });

			expect(result.offset).toBe(5);
		});

		test("should respect max limit of 100", async () => {
			const result = await autumn.customers.list({ limit: 100 });

			expect(result.limit).toBe(100);
		});
	});

	// Search Tests
	describe("search", () => {
		test("should search by customer ID", async () => {
			const result = await autumn.customers.list({
				search: "searchable-john",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.searchable,
			);
			expect(found).toBeDefined();
		});

		test("should search by customer email", async () => {
			const result = await autumn.customers.list({
				search: "searchable-john@example",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.searchable,
			);
			expect(found).toBeDefined();
		});

		test("should return empty list for non-matching search", async () => {
			const result = await autumn.customers.list({
				search: "nonexistent-customer-xyz-123",
			});

			expect(result.list.length).toBe(0);
		});

		test("should be case-insensitive", async () => {
			const result = await autumn.customers.list({
				search: "SEARCHABLE-JOHN",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
		});
	});

	// Product ID Filter Tests
	describe("product_id filter", () => {
		test("should filter by product_id", async () => {
			const result = await autumn.customers.list({
				product_id: productV1.id,
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductV1,
			);
			expect(found).toBeDefined();

			// Should not include customers without this product
			const notFound = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.noProducts,
			);
			expect(notFound).toBeUndefined();
		});

		test("should return empty list for non-existent product_id", async () => {
			const result = await autumn.customers.list({
				product_id: "nonexistent-product-xyz",
			});

			expect(result.list.length).toBe(0);
		});
	});

	// Product Version Filter Tests
	describe("product_version filter", () => {
		test("should filter by single version (v1)", async () => {
			const result = await autumn.customers.list({
				product_id: productV1.id,
				product_version: 1,
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductV1,
			);
			expect(found).toBeDefined();
		});

		test("should filter by multiple versions", async () => {
			const result = await autumn.customers.list({
				product_id: productV1.id,
				product_version: [1, 2],
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
		});

		test("should return empty for non-existent version", async () => {
			const result = await autumn.customers.list({
				product_id: productV1.id,
				product_version: 999,
			});

			expect(result.list.length).toBe(0);
		});
	});

	// Product Status Filter Tests
	describe("product_status filter", () => {
		test("should filter by active status", async () => {
			const result = await autumn.customers.list({
				product_status: "active",
			});

			// All customers with active products should be returned
			expect(result.list.length).toBeGreaterThanOrEqual(1);
		});

		test("should filter by multiple statuses", async () => {
			const result = await autumn.customers.list({
				product_status: ["active", "trialing"],
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
		});

		test("should exclude customers without matching status", async () => {
			const result = await autumn.customers.list({
				product_status: "expired",
			});

			// Our test customers have active products, not expired
			const foundNoProducts = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.noProducts,
			);
			expect(foundNoProducts).toBeUndefined();
		});
	});

	// Combined Filter Tests
	describe("combined filters", () => {
		test("should combine search and product_id", async () => {
			const result = await autumn.customers.list({
				search: "cus-v1",
				product_id: productV1.id,
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductV1,
			);
			expect(found).toBeDefined();
		});

		test("should combine product_id, product_version, and product_status", async () => {
			const result = await autumn.customers.list({
				product_id: productV1.id,
				product_version: 1,
				product_status: "active",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
		});
	});

	// Response Structure Tests
	describe("response structure", () => {
		test("should have correct response structure", async () => {
			const result = await autumn.customers.list();

			expect(result).toHaveProperty("list");
			expect(result).toHaveProperty("total");
			expect(result).toHaveProperty("limit");
			expect(result).toHaveProperty("offset");
		});

		test("each customer should have expected fields", async () => {
			const result = await autumn.customers.list({ limit: 10 });

			if (result.list.length > 0) {
				const customer = result.list[0];
				expect(customer).toHaveProperty("id");
				expect(customer).toHaveProperty("created_at");
				expect(customer).toHaveProperty("products");
				expect(customer).toHaveProperty("features");
			}
		});
	});
});
