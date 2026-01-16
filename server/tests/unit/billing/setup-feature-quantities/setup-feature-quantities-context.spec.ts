import { describe, expect, test } from "bun:test";
import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";

// ============ TESTS ============

describe(chalk.yellowBright("setupFeatureQuantitiesContext"), () => {
	describe("basic quantity inheritance", () => {
		test("1. current has quantity, new params has none → uses current", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options provided
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 50 }],
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
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

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const creditsFeature = features.create({
				id: "credits",
				name: "Credits",
			});
			const seatsFeature = features.create({
				id: "seats",
				name: "Seats",
			});
			const storageFeature = features.create({
				id: "storage",
				name: "Storage",
			});

			const creditsPrice = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});
			const seatsPrice = prices.createPrepaid({
				id: "price_seats",
				featureId: "seats",
			});
			const storagePrice = prices.createPrepaid({
				id: "price_storage",
				featureId: "storage",
			});

			const fullProduct = products.createFull({
				prices: [creditsPrice, seatsPrice, storagePrice],
			});

			const cusProduct = customerProducts.create({
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
					prices.createCustomer({ price: creditsPrice }),
					prices.createCustomer({ price: seatsPrice }),
					prices.createCustomer({ price: storagePrice }),
				],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "seats", quantity: 10 }], // Only updating seats
			};

			const ctx = contexts.create({
				features: [creditsFeature, seatsFeature, storageFeature],
			});

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 100, // Billing in units of 100
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 150 }], // Should round up to 200
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 50,
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 200 }], // Exact multiple
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				billingUnits: 1000,
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 1 }], // Should round to 1000
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			// Old price: billing units of 100
			const oldPrice = prices.createPrepaid({
				id: "price_credits_old",
				featureId: "credits",
				billingUnits: 100,
			});

			// New price: billing units of 250
			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({ prices: [newPrice] });

			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 5, // 5 packs of 100 = 500 actual credits
					},
				],
				customerPrices: [prices.createCustomer({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options - should inherit from current
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const oldPrice = prices.createPrepaid({
				id: "price_credits_old",
				featureId: "credits",
				billingUnits: 100,
			});

			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({ prices: [newPrice] });

			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 3, // 3 packs of 100 = 300 actual credits
					},
				],
				customerPrices: [prices.createCustomer({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({ prices: [newPrice] });

			const cusProduct = customerProducts.create({
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

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const fixedPrice = prices.createFixed({ id: "price_fixed" });
			const prepaidPrice = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({
				prices: [fixedPrice, prepaidPrice],
			});

			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 50 }],
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const fullProduct = products.createFull({ prices: [] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = contexts.create({ features: [] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(0);
		});

		test("throws error when feature not found for price", () => {
			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			// Empty features array - feature won't be found
			const ctx = contexts.create({ features: [] });

			expect(() =>
				setupFeatureQuantitiesContext({
					ctx,
					featureQuantitiesParams: params,
					fullProduct,
					currentCustomerProduct: cusProduct,
				}),
			).toThrow("Feature not found for price");
		});

		test("neither current nor new has quantity → feature not included", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({ options: [] }); // No current options

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options in params either
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			// Since neither current nor new has quantity, nothing should be included
			expect(result).toHaveLength(0);
		});

		test("params.options explicitly set to empty array → uses current quantities", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [], // Explicitly empty
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
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
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				options: [{ feature_id: "credits", quantity: 0 }],
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(0);
		});

		test("handles feature matched by internal_feature_id in current options", () => {
			const feature = features.create({
				id: "credits",
				internalId: "internal_credits_v2",
				name: "Credits",
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				internalFeatureId: "internal_credits_v2",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "old_credits_id", // Different feature_id
						internal_feature_id: "internal_credits_v2", // Matches by internal_id
						quantity: 75,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(75);
		});

		test("current has options with quantity 0, new params has no options → carries over 0", () => {
			const feature = features.create({
				id: "seats",
				name: "Seats",
			});

			const price = prices.createPrepaid({
				id: "price_seats",
				featureId: "seats",
			});

			const fullProduct = products.createFull({ prices: [price] });
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "seats",
						internal_feature_id: "internal_seats",
						quantity: 0,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV0Params = {
				customer_id: "cus_test",
				product_id: "prod_test",
				// No options provided - should carry over from current
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].feature_id).toBe("seats");
			expect(result[0].quantity).toBe(0);
		});
	});
});
