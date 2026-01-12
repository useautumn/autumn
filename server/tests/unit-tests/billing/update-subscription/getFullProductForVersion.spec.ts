/**
 * Unit tests for getFullProductForVersion function.
 *
 * Tests the version resolution logic:
 * - Returns current customer product version when no version specified
 * - Database-dependent tests (version fetching, error handling) covered in integration tests
 */

import { describe, expect, test } from "bun:test";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import { createMockFullProduct } from "@tests/utils/mockUtils/productMocks";
import chalk from "chalk";
import { getFullProductForVersion } from "@/internal/billing/v2/updateSubscription/setup/getFullProductForVersion";

describe(chalk.yellowBright("getFullProductForVersion"), () => {
	describe(chalk.cyan("No version specified (uses current)"), () => {
		test("returns product from customer product when version is undefined", async () => {
			const product = createMockFullProduct({
				id: "prod_test",
				name: "Test Product V1",
			});
			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_test",
				productId: "prod_test",
				product,
			});

			const result = await getFullProductForVersion({
				ctx: {} as never, // ctx not used when version undefined
				targetCustomerProduct: customerProduct,
				version: undefined,
			});

			expect(result.id).toBe("prod_test");
			expect(result.name).toBe("Test Product V1");
		});

		test("returns product from customer product when version is null", async () => {
			const product = createMockFullProduct({
				id: "prod_v2",
				name: "Product Version 2",
			});
			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_test",
				productId: "prod_v2",
				product,
			});

			const result = await getFullProductForVersion({
				ctx: {} as never,
				targetCustomerProduct: customerProduct,
				version: null as unknown as undefined,
			});

			expect(result.id).toBe("prod_v2");
			expect(result.name).toBe("Product Version 2");
		});

		test("preserves all product fields from customer product", async () => {
			const product = createMockFullProduct({
				id: "prod_full",
				name: "Full Product",
				isAddOn: true,
			});
			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_full",
				productId: "prod_full",
				product,
			});

			const result = await getFullProductForVersion({
				ctx: {} as never,
				targetCustomerProduct: customerProduct,
				version: undefined,
			});

			expect(result.id).toBe("prod_full");
			expect(result.name).toBe("Full Product");
			expect(result.is_add_on).toBe(true);
			expect(result.entitlements).toEqual([]);
			expect(result.prices).toEqual([]);
		});
	});

	// Note: Tests for version fetching and error handling require database access
	// and are covered in integration tests (server/tests/billing/update-subscription/version-update.test.ts)
});
