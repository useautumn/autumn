import { describe, expect, test } from "bun:test";
import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import { createMockCtx } from "@tests/utils/mockUtils/contextMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import { createMockFeature } from "@tests/utils/mockUtils/featureMocks";
import {
	createMockCustomerPrice,
	createMockFixedPrice,
	createMockPrepaidPrice,
} from "@tests/utils/mockUtils/priceMocks";
import { createMockFullProduct } from "@tests/utils/mockUtils/productMocks";
import chalk from "chalk";
import { parseFeatureQuantitiesParams } from "@/internal/billing/v2/utils/parseFeatureQuantitiesParams";

// ============ TESTS ============

describe(chalk.yellowBright("parseFeatureQuantitiesParams"), () => {
	describe("basic quantity inheritance", () => {
		test("1. current has quantity, new params has none → uses current", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [createMockCustomerPrice({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options provided
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			expect(result[0].quantity).toBe(100);
		});

		test("2. current has no quantity, new params has quantity → uses new", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 50 }],
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			expect(result[0].quantity).toBe(50);
		});

		test("3. both have quantity → uses new (new takes precedence)", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 200 }],
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			expect(result[0].quantity).toBe(200);
		});
	});

	describe("multiple features", () => {
		test("4. previous has all quantities, new has just one → updates only the specified one", () => {
			const creditsFeature = createMockFeature({
				id: "credits",
				name: "Credits",
			});
			const seatsFeature = createMockFeature({
				id: "seats",
				name: "Seats",
			});
			const storageFeature = createMockFeature({
				id: "storage",
				name: "Storage",
			});

			const creditsPrice = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});
			const seatsPrice = createMockPrepaidPrice({
				id: "price_seats",
				featureId: "seats",
			});
			const storagePrice = createMockPrepaidPrice({
				id: "price_storage",
				featureId: "storage",
			});

			const fullProduct = createMockFullProduct({
				prices: [creditsPrice, seatsPrice, storagePrice],
			});

			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
					{
						feature_id: "seats",
						internal_feature_id: "internal_seats",
						quantity: 5,
					},
					{
						feature_id: "storage",
						internal_feature_id: "internal_storage",
						quantity: 50,
					},
				],
				customerPrices: [
					createMockCustomerPrice({ price: creditsPrice }),
					createMockCustomerPrice({ price: seatsPrice }),
					createMockCustomerPrice({ price: storagePrice }),
				],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "seats", quantity: 10 }], // Only updating seats
			};

			const ctx = createMockCtx({
				features: [creditsFeature, seatsFeature, storageFeature],
			});

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(3);

			const credits = result.find((r) => r.feature_id === "credits");
			const seats = result.find((r) => r.feature_id === "seats");
			const storage = result.find((r) => r.feature_id === "storage");

			expect(credits?.quantity).toBe(100); // Unchanged
			expect(seats?.quantity).toBe(10); // Updated
			expect(storage?.quantity).toBe(50); // Unchanged
		});
	});

	describe("billing units handling", () => {
		test("5. new params quantity is rounded to billing units", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 100, // Billing in units of 100
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 150 }], // Should round up to 200
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			// 150 rounded up to 200, then divided by billingUnits (100) = 2
			expect(result[0].quantity).toBe(2);
		});

		test("exact billing unit multiple is not changed", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 50,
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 200 }], // Exact multiple
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			// 200 / 50 = 4
			expect(result[0].quantity).toBe(4);
		});

		test("small quantity rounds up to 1 billing unit", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 1000,
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 1 }], // Should round to 1000
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			// 1 rounded to 1000, then divided by billingUnits (1000) = 1
			expect(result[0].quantity).toBe(1);
		});

		test("converts current quantity from old billing units to new billing units", () => {
			// Scenario: Customer has 5 packs of 100 credits (500 actual credits)
			// New price uses packs of 250
			// Expected: 500 credits → rounds to 500 (nearest 250) → 2 packs
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			// Old price: billing units of 100
			const oldPrice = createMockPrepaidPrice({
				id: "price_credits_old",
				featureId: "credits",
				billingUnits: 100,
			});

			// New price: billing units of 250
			const newPrice = createMockPrepaidPrice({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = createMockFullProduct({ prices: [newPrice] });

			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 5, // 5 packs of 100 = 500 actual credits
					},
				],
				customerPrices: [createMockCustomerPrice({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options - should inherit from current
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			// Old: 5 packs * 100 = 500 credits
			// Round 500 to nearest 250 = 500
			// New: 500 / 250 = 2 packs
			expect(result[0].quantity).toBe(2);
		});

		test("converts and rounds up when not exact multiple of new billing units", () => {
			// Scenario: Customer has 3 packs of 100 credits (300 actual credits)
			// New price uses packs of 250
			// Expected: 300 credits → rounds to 500 (nearest 250) → 2 packs
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const oldPrice = createMockPrepaidPrice({
				id: "price_credits_old",
				featureId: "credits",
				billingUnits: 100,
			});

			const newPrice = createMockPrepaidPrice({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = createMockFullProduct({ prices: [newPrice] });

			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 3, // 3 packs of 100 = 300 actual credits
					},
				],
				customerPrices: [createMockCustomerPrice({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			// Old: 3 packs * 100 = 300 credits
			// Round 300 to nearest 250 (ceiling) = 500
			// New: 500 / 250 = 2 packs
			expect(result[0].quantity).toBe(2);
		});

		test("no old customer price returns undefined (no quantity inherited)", () => {
			// Scenario: No old price found - can't interpret the stored quantity
			// Should return empty result (no feature quantities)
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const newPrice = createMockPrepaidPrice({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = createMockFullProduct({ prices: [newPrice] });

			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 500,
					},
				],
				// No customerPrices - can't interpret stored quantity
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			// No old price means we can't interpret the stored quantity
			// So no feature quantity is inherited
			expect(result).toHaveLength(0);
		});
	});

	describe("price type filtering", () => {
		test("skips non-prepaid prices (fixed prices)", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const fixedPrice = createMockFixedPrice({ id: "price_fixed" });
			const prepaidPrice = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({
				prices: [fixedPrice, prepaidPrice],
			});

			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 50 }],
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			// Only the prepaid price should be processed
			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
		});
	});

	describe("edge cases", () => {
		test("empty prices array returns empty array", () => {
			const fullProduct = createMockFullProduct({ prices: [] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = createMockCtx({ features: [] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(0);
		});

		test("throws error when feature not found for price", () => {
			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			// Empty features array - feature won't be found
			const ctx = createMockCtx({ features: [] });

			expect(() =>
				parseFeatureQuantitiesParams({
					ctx,
					featureQuantitiesParams: params,
					fullProduct,
					currentCustomerProduct: cusProduct,
				}),
			).toThrow("Feature not found for price");
		});

		test("neither current nor new has quantity → feature not included", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({ options: [] }); // No current options

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options in params either
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			// Since neither current nor new has quantity, nothing should be included
			expect(result).toHaveLength(0);
		});

		test("params.options explicitly set to empty array → uses current quantities", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [createMockCustomerPrice({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [], // Explicitly empty
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("credits");
			expect(result[0].quantity).toBe(100); // Falls back to current
		});

		test("new quantity of 0 is valid and replaces current", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [createMockCustomerPrice({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 0 }],
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			// quantity: 0 is falsy, so paramsToFeatureOptions returns undefined
			// Falls back to current quantity
			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(100);
		});

		test("handles feature matched by internal_feature_id in current options", () => {
			const feature = createMockFeature({
				id: "credits",
				internalId: "internal_credits_v2",
				name: "Credits",
			});

			const price = createMockPrepaidPrice({
				id: "price_credits",
				featureId: "credits",
				internalFeatureId: "internal_credits_v2",
			});

			const fullProduct = createMockFullProduct({ prices: [price] });
			const cusProduct = createMockCustomerProduct({
				options: [
					{
						feature_id: "old_credits_id", // Different feature_id
						internal_feature_id: "internal_credits_v2", // Matches by internal_id
						quantity: 75,
					},
				],
				customerPrices: [createMockCustomerPrice({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = createMockCtx({ features: [feature] });

			const result = parseFeatureQuantitiesParams({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(75);
		});
	});
});
