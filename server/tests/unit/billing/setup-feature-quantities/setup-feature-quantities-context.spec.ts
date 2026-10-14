import { describe, expect, test } from "bun:test";
import type { UpdateSubscriptionV1Params } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";

describe(chalk.yellowBright("setupFeatureQuantitiesContext"), () => {
	describe("basic quantity inheritance", () => {
		test("1. current has quantity, new params has none → uses current", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
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

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
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

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 50 }],
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

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 100,
					},
				],
			});

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 200 }],
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

			const creditsEnt = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});
			const seatsEnt = entitlements.create({
				id: "ent_seats",
				featureId: "seats",
				featureName: "Seats",
				allowance: 0,
			});
			const storageEnt = entitlements.create({
				id: "ent_storage",
				featureId: "storage",
				featureName: "Storage",
				allowance: 0,
			});

			const creditsPrice = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});
			const seatsPrice = prices.createPrepaid({
				id: "price_seats",
				featureId: "seats",
				entitlementId: "ent_seats",
			});
			const storagePrice = prices.createPrepaid({
				id: "price_storage",
				featureId: "storage",
				entitlementId: "ent_storage",
			});

			const fullProduct = products.createFull({
				prices: [creditsPrice, seatsPrice, storagePrice],
				entitlements: [creditsEnt, seatsEnt, storageEnt],
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

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "seats", quantity: 10 }],
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

			expect(credits?.quantity).toBe(100);
			expect(seats?.quantity).toBe(10);
			expect(storage?.quantity).toBe(50);
		});
	});

	describe("billing units handling", () => {
		test("5. new params quantity is rounded to billing units", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 100,
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 150 }],
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
			expect(result[0].quantity).toBe(2);
		});

		test("exact billing unit multiple is not changed", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 50,
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 200 }],
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(4);
		});

		test("small quantity rounds up to 1 billing unit", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 1000,
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 1 }],
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(1);
		});

		test("converts current quantity from old billing units to new billing units", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const oldPrice = prices.createPrepaid({
				id: "price_credits_old",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 100,
			});

			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({
				prices: [newPrice],
				entitlements: [entitlement],
			});

			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 5,
					},
				],
				customerPrices: [prices.createCustomer({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
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
			expect(result[0].quantity).toBe(2);
		});

		test("converts and rounds up when not exact multiple of new billing units", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const oldPrice = prices.createPrepaid({
				id: "price_credits_old",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 100,
			});

			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({
				prices: [newPrice],
				entitlements: [entitlement],
			});

			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 3,
					},
				],
				customerPrices: [prices.createCustomer({ price: oldPrice })],
			});

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(1);
			expect(result[0].quantity).toBe(2);
		});

		test("no old customer price returns undefined (no quantity inherited)", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const newPrice = prices.createPrepaid({
				id: "price_credits_new",
				featureId: "credits",
				entitlementId: "ent_credits",
				billingUnits: 250,
			});

			const fullProduct = products.createFull({
				prices: [newPrice],
				entitlements: [entitlement],
			});

			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 500,
					},
				],
			});

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(0);
		});
	});

	describe("price type filtering", () => {
		test("skips non-prepaid prices (fixed prices)", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const fixedPrice = prices.createFixed({ id: "price_fixed" });
			const prepaidPrice = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [fixedPrice, prepaidPrice],
				entitlements: [entitlement],
			});

			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 50 }],
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
		});
	});

	describe("edge cases", () => {
		test("empty prices array returns empty array", () => {
			const fullProduct = products.createFull({ prices: [], entitlements: [] });
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
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

		test("throws error when entitlement not found for price", () => {
			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
			};

			const ctx = contexts.create({ features: [] });

			expect(() =>
				setupFeatureQuantitiesContext({
					ctx,
					featureQuantitiesParams: params,
					fullProduct,
					currentCustomerProduct: cusProduct,
				}),
			).toThrow("Entitlement not found for price");
		});

		test("neither current nor new has quantity → feature not included", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({ options: [] });

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
			};

			const ctx = contexts.create({ features: [feature] });

			const result = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: params,
				fullProduct,
				currentCustomerProduct: cusProduct,
			});

			expect(result).toHaveLength(0);
		});

		test("params.options explicitly set to empty array → uses current quantities", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
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

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [],
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

		test("new quantity of 0 is valid and replaces current", () => {
			const feature = features.create({
				id: "credits",
				name: "Credits",
			});

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
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

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
				feature_quantities: [{ feature_id: "credits", quantity: 0 }],
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

			const entitlement = entitlements.create({
				id: "ent_credits",
				featureId: "credits",
				internalFeatureId: "internal_credits_v2",
				featureName: "Credits",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_credits",
				featureId: "credits",
				internalFeatureId: "internal_credits_v2",
				entitlementId: "ent_credits",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
			const cusProduct = customerProducts.create({
				options: [
					{
						feature_id: "old_credits_id",
						internal_feature_id: "internal_credits_v2",
						quantity: 75,
					},
				],
				customerPrices: [prices.createCustomer({ price })],
			});

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
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

			const entitlement = entitlements.create({
				id: "ent_seats",
				featureId: "seats",
				featureName: "Seats",
				allowance: 0,
			});

			const price = prices.createPrepaid({
				id: "price_seats",
				featureId: "seats",
				entitlementId: "ent_seats",
			});

			const fullProduct = products.createFull({
				prices: [price],
				entitlements: [entitlement],
			});
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

			const params: UpdateSubscriptionV1Params = {
				customer_id: "cus_test",
				plan_id: "prod_test",
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
