import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "list-customers";

// Different products for testing multi-plan filtering
const productA = constructProduct({
	id: `${testCase}-product-a`,
	type: "free",
	isDefault: false,
	version: 1,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
	],
});

const productB = constructProduct({
	id: `${testCase}-product-b`,
	type: "free",
	isDefault: false,
	version: 1,
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
	withProductA: `${testCase}-cus-a`,
	withProductB: `${testCase}-cus-b`,
	withOtherProduct: `${testCase}-cus-other`,
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
			products: [productA, productB, otherProduct],
			prefix: "",
			customerId: customerIds.withProductA,
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
			customer_id: customerIds.withProductA,
			product_id: productA.id,
		});

		await autumn.attach({
			customer_id: customerIds.withProductB,
			product_id: productB.id,
		});

		await autumn.attach({
			customer_id: customerIds.withOtherProduct,
			product_id: otherProduct.id,
		});

		// Attach product to searchable customer so it's not filtered out by default status
		await autumn.attach({
			customer_id: customerIds.searchable,
			product_id: productA.id,
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

	// Search Tests (V2)
	describe("search", () => {
		test("should search by customer ID", async () => {
			const result = await autumn.customers.listV2({
				search: "searchable-john",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.searchable,
			);
			expect(found).toBeDefined();
		});

		test("should search by customer email", async () => {
			const result = await autumn.customers.listV2({
				search: "searchable-john@example",
			});

			expect(result.list.length).toBeGreaterThanOrEqual(1);
			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.searchable,
			);
			expect(found).toBeDefined();
		});

		test("should return empty list for non-matching search", async () => {
			const result = await autumn.customers.listV2({
				search: "nonexistent-customer-xyz-123",
			});

			expect(result.list.length).toBe(0);
		});

		test("should be case-insensitive", async () => {
			const result = await autumn.customers.listV2({
				search: "SEARCHABLE-JOHN",
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

	// V2 Plans Filter Tests
	describe("plans filter (V2)", () => {
		test("should filter by single plan and exclude non-matching customers", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }],
			});

			// Should find customers with productA (withProductA and searchable)
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			const foundSearchable = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.searchable,
			);
			expect(foundA).toBeDefined();
			expect(foundSearchable).toBeDefined();

			// Should NOT find customers with other products
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			const foundOther = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withOtherProduct,
			);
			expect(foundB).toBeUndefined();
			expect(foundOther).toBeUndefined();
		});

		test("should filter by single plan with specific version", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id, versions: [1] }],
			});

			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			expect(found).toBeDefined();

			// Should NOT find customers with productB (different product)
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundB).toBeUndefined();
		});

		test("should return empty list for non-matching version", async () => {
			// All products are version 1, so filtering for version 999 should return empty
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id, versions: [999] }],
			});

			expect(result.list.length).toBe(0);
		});

		test("should filter by multiple plans (OR logic)", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }, { id: productB.id }],
			});

			// Should find customers with productA OR productB
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundA).toBeDefined();
			expect(foundB).toBeDefined();

			// Should NOT find customer with otherProduct (not in filter)
			const foundOther = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withOtherProduct,
			);
			expect(foundOther).toBeUndefined();
		});

		test("should filter by multiple plans including other product", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }, { id: otherProduct.id }],
			});

			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			const foundOther = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withOtherProduct,
			);
			expect(foundA).toBeDefined();
			expect(foundOther).toBeDefined();

			// Should NOT find customer with productB
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundB).toBeUndefined();
		});

		test("should filter by plan with version constraint", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id, versions: [1] }, { id: otherProduct.id }],
			});

			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			const foundOther = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withOtherProduct,
			);
			expect(foundA).toBeDefined();
			expect(foundOther).toBeDefined();

			// Should NOT find customer with productB
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundB).toBeUndefined();
		});

		test("should combine plans filter with search", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }],
				search: "cus-a",
			});

			// Should find exactly the customer matching both criteria
			expect(result.list.length).toBe(1);
			expect(result.list[0].id).toBe(customerIds.withProductA);
		});

		test("should return empty list for non-existent plan", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: "nonexistent-plan-xyz" }],
			});

			expect(result.list.length).toBe(0);
		});

		test("should return empty list for non-existent version", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id, versions: [999] }],
			});

			expect(result.list.length).toBe(0);
		});

		test("should have correct response structure", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }],
			});

			expect(result).toHaveProperty("list");
			expect(result).toHaveProperty("total");
			expect(result).toHaveProperty("limit");
			expect(result).toHaveProperty("offset");
		});

		test("should return plan_version in product response", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }],
			});

			const found = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			expect(found).toBeDefined();

			// Check that version is returned correctly (V1.2 returns as 'products' with 'version' field)
			const products = (found as any).products;
			expect(products).toBeDefined();
			expect(Array.isArray(products)).toBe(true);

			const matchingProduct = products.find((p: any) => p.id === productA.id);
			expect(matchingProduct).toBeDefined();
			expect(matchingProduct.version).toBe(1);
		});
	});

	// V2 Subscription Status Filter Tests
	describe("subscription_status filter (V2)", () => {
		test("should filter by active status", async () => {
			const result = await autumn.customers.listV2({
				subscription_status: ["active"],
			});

			// All our test customers have active products
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundA).toBeDefined();
			expect(foundB).toBeDefined();
		});

		test("should filter by multiple statuses", async () => {
			const result = await autumn.customers.listV2({
				subscription_status: ["active", "scheduled"],
			});

			// Should include active customers
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			expect(foundA).toBeDefined();
		});

		test("should combine subscription_status with plans filter (AND logic)", async () => {
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id }],
				subscription_status: ["active"],
			});

			// Should find customers with productA AND active status
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			expect(foundA).toBeDefined();

			// Should NOT find customers with other products even if active
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			const foundOther = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withOtherProduct,
			);
			expect(foundB).toBeUndefined();
			expect(foundOther).toBeUndefined();
		});

		test("should require BOTH plan AND status to match when combined", async () => {
			// Filter for productA with active status
			const result = await autumn.customers.listV2({
				plans: [{ id: productA.id, versions: [1] }],
				subscription_status: ["active"],
			});

			// Only customers with productA v1 AND active status should be returned
			const foundA = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductA,
			);
			expect(foundA).toBeDefined();

			// ProductB customer should NOT be returned (wrong product)
			const foundB = result.list.find(
				(customer: ApiCustomer) => customer.id === customerIds.withProductB,
			);
			expect(foundB).toBeUndefined();
		});
	});
});
