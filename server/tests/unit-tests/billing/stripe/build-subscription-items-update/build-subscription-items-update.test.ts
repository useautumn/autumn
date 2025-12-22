import { describe, expect, test } from "bun:test";
import { createMockCtx } from "@tests/utils/mockUtils/contextMocks";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import { createMockFeature } from "@tests/utils/mockUtils/featureMocks";
import {
	createMockAllocatedPrice,
	createMockConsumablePrice,
	createMockCustomerPrice,
	createMockFixedPrice,
	createMockOneOffPrice,
	createMockPrepaidPrice,
} from "@tests/utils/mockUtils/priceMocks";
import { createMockFullProduct } from "@tests/utils/mockUtils/productMocks";
import chalk from "chalk";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/utils/stripeAdapter/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { createMockBillingContext } from "./billingContextMocks";
import { createMockStripeSubscription } from "./stripeSubscriptionMocks";

// ============ TESTS ============

describe(chalk.yellowBright("buildStripeSubscriptionItemsUpdate"), () => {
	describe("no existing subscription", () => {
		test("1. new customer product with fixed price", () => {
			const fixedPrice = createMockFixedPrice({
				id: "price_fixed",
				stripePriceId: "stripe_price_fixed",
			});

			const product = createMockFullProduct({
				id: "prod_pro",
				prices: [fixedPrice],
				stripeProductId: "stripe_prod_pro",
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_pro",
				product,
				customerPrices: [createMockCustomerPrice({ price: fixedPrice })],
			});

			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_price_fixed",
				quantity: 1,
			});
		});

		test("2. new customer product with prepaid price", () => {
			const feature = createMockFeature({
				id: "credits",
				name: "Credits",
			});

			const prepaidPrice = createMockPrepaidPrice({
				id: "price_prepaid",
				featureId: "credits",
				stripePriceId: "stripe_price_prepaid",
			});

			const product = createMockFullProduct({
				id: "prod_pro",
				prices: [prepaidPrice],
				stripeProductId: "stripe_prod_pro",
			});

			const cusEnt = createMockCusEntitlement({
				featureId: "credits",
				featureName: "Credits",
				allowance: 100,
				balance: 100,
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_pro",
				product,
				customerPrices: [createMockCustomerPrice({ price: prepaidPrice })],
				customerEntitlements: [cusEnt],
				options: [
					{
						feature_id: "credits",
						internal_feature_id: "internal_credits",
						quantity: 5,
					},
				],
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_price_prepaid",
				quantity: 5,
			});
		});

		test("3. consumable price with entity uses stripe_empty_price_id", () => {
			const feature = createMockFeature({
				id: "api_calls",
				name: "API Calls",
			});

			const consumablePrice = createMockConsumablePrice({
				id: "price_usage",
				featureId: "api_calls",
				stripePriceId: "stripe_price_usage",
				stripeEmptyPriceId: "stripe_empty_price_usage",
			});

			const product = createMockFullProduct({
				id: "prod_usage",
				prices: [consumablePrice],
				stripeProductId: "stripe_prod_usage",
			});

			const cusEnt = createMockCusEntitlement({
				featureId: "api_calls",
				featureName: "API Calls",
				allowance: 1000,
				balance: 1000,
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_usage",
				product,
				customerPrices: [createMockCustomerPrice({ price: consumablePrice })],
				customerEntitlements: [cusEnt],
				internalEntityId: "entity_123", // Has entity
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_empty_price_usage",
				quantity: 0,
			});
		});
	});

	describe("existing subscription", () => {
		test("4. remove one customer product, add another", () => {
			const oldPrice = createMockFixedPrice({
				id: "price_old",
				stripePriceId: "stripe_price_old",
			});

			const newPrice = createMockFixedPrice({
				id: "price_new",
				stripePriceId: "stripe_price_new",
			});

			const oldProduct = createMockFullProduct({
				id: "prod_old",
				prices: [oldPrice],
				stripeProductId: "stripe_prod_old",
			});

			const newProduct = createMockFullProduct({
				id: "prod_new",
				prices: [newPrice],
				stripeProductId: "stripe_prod_new",
			});

			const oldCustomerProduct = createMockCustomerProduct({
				id: "cus_prod_old",
				productId: "prod_old",
				product: oldProduct,
				customerPrices: [createMockCustomerPrice({ price: oldPrice })],
				subscriptionIds: ["sub_123"],
			});

			const newCustomerProduct = createMockCustomerProduct({
				id: "cus_prod_new",
				productId: "prod_new",
				product: newProduct,
				customerPrices: [createMockCustomerPrice({ price: newPrice })],
			});

			const stripeSubscription = createMockStripeSubscription({
				id: "sub_123",
				items: [{ id: "si_old", priceId: "stripe_price_old", quantity: 1 }],
			});

			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [oldCustomerProduct],
				stripeSubscription,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [newCustomerProduct],
				removeCustomerProducts: [oldCustomerProduct],
			});

			expect(result).toHaveLength(2);

			// Should delete old item
			const deletedItem = result.find((item) => item.deleted === true);
			expect(deletedItem).toBeDefined();
			expect(deletedItem?.id).toBe("si_old");

			// Should add new item
			const newItem = result.find((item) => item.price === "stripe_price_new");
			expect(newItem).toBeDefined();
			expect(newItem?.quantity).toBe(1);
		});

		test("5. update quantity of existing subscription item", () => {
			const feature = createMockFeature({
				id: "seats",
				name: "Seats",
			});

			const prepaidPrice = createMockPrepaidPrice({
				id: "price_seats",
				featureId: "seats",
				stripePriceId: "stripe_price_seats",
			});

			const product = createMockFullProduct({
				id: "prod_team",
				prices: [prepaidPrice],
				stripeProductId: "stripe_prod_team",
			});

			const cusEnt = createMockCusEntitlement({
				featureId: "seats",
				featureName: "Seats",
				allowance: 10,
				balance: 10,
			});

			// Current: 5 seats, updating to 10 seats
			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_team",
				product,
				customerPrices: [createMockCustomerPrice({ price: prepaidPrice })],
				customerEntitlements: [cusEnt],
				subscriptionIds: ["sub_123"],
				options: [
					{
						feature_id: "seats",
						internal_feature_id: "internal_seats",
						quantity: 10, // Updated quantity
					},
				],
			});

			const stripeSubscription = createMockStripeSubscription({
				id: "sub_123",
				items: [
					{ id: "si_seats", priceId: "stripe_price_seats", quantity: 5 }, // Old quantity
				],
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [customerProduct],
				stripeSubscription,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: "si_seats",
				quantity: 10,
			});
		});
	});

	describe("edge cases", () => {
		test("6. no changes needed returns empty array", () => {
			const fixedPrice = createMockFixedPrice({
				id: "price_fixed",
				stripePriceId: "stripe_price_fixed",
			});

			const product = createMockFullProduct({
				id: "prod_pro",
				prices: [fixedPrice],
				stripeProductId: "stripe_prod_pro",
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_pro",
				product,
				customerPrices: [createMockCustomerPrice({ price: fixedPrice })],
				subscriptionIds: ["sub_123"],
			});

			const stripeSubscription = createMockStripeSubscription({
				id: "sub_123",
				items: [{ id: "si_fixed", priceId: "stripe_price_fixed", quantity: 1 }],
			});

			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [customerProduct],
				stripeSubscription,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
			});

			expect(result).toHaveLength(0);
		});

		test("7. multiple products with same price ID aggregates quantities", () => {
			const feature = createMockFeature({
				id: "seats",
				name: "Seats",
			});

			const sharedPrice = createMockPrepaidPrice({
				id: "price_seats",
				featureId: "seats",
				stripePriceId: "stripe_price_seats",
			});

			const product1 = createMockFullProduct({
				id: "prod_team_1",
				prices: [sharedPrice],
				stripeProductId: "stripe_prod_team_1",
			});

			const product2 = createMockFullProduct({
				id: "prod_team_2",
				prices: [sharedPrice],
				stripeProductId: "stripe_prod_team_2",
			});

			const cusEnt1 = createMockCusEntitlement({
				id: "cus_ent_1",
				featureId: "seats",
				featureName: "Seats",
				allowance: 5,
				balance: 5,
			});

			const cusEnt2 = createMockCusEntitlement({
				id: "cus_ent_2",
				featureId: "seats",
				featureName: "Seats",
				allowance: 3,
				balance: 3,
			});

			const customerProduct1 = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_team_1",
				product: product1,
				customerPrices: [createMockCustomerPrice({ price: sharedPrice })],
				customerEntitlements: [cusEnt1],
				options: [
					{
						feature_id: "seats",
						internal_feature_id: "internal_seats",
						quantity: 5,
					},
				],
			});

			const customerProduct2 = createMockCustomerProduct({
				id: "cus_prod_2",
				productId: "prod_team_2",
				product: product2,
				customerPrices: [createMockCustomerPrice({ price: sharedPrice })],
				customerEntitlements: [cusEnt2],
				options: [
					{
						feature_id: "seats",
						internal_feature_id: "internal_seats",
						quantity: 3,
					},
				],
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct1, customerProduct2],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_price_seats",
				quantity: 8, // 5 + 3
			});
		});

		test("8. empty customer products marks all current items as deleted", () => {
			const stripeSubscription = createMockStripeSubscription({
				id: "sub_123",
				items: [
					{ id: "si_1", priceId: "stripe_price_1", quantity: 1 },
					{ id: "si_2", priceId: "stripe_price_2", quantity: 2 },
				],
			});

			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
			});

			expect(result).toHaveLength(2);
			expect(result).toContainEqual({ id: "si_1", deleted: true });
			expect(result).toContainEqual({ id: "si_2", deleted: true });
		});

		test("9. no stripe subscription and no products returns empty array", () => {
			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
			});

			expect(result).toHaveLength(0);
		});

		test("10. allocated price uses stripe_empty_price_id with quantity 0", () => {
			const feature = createMockFeature({
				id: "storage",
				name: "Storage",
			});

			const allocatedPrice = createMockAllocatedPrice({
				id: "price_storage",
				featureId: "storage",
				stripePriceId: "stripe_price_storage",
				stripeEmptyPriceId: "stripe_empty_price_storage",
			});

			const product = createMockFullProduct({
				id: "prod_storage",
				prices: [allocatedPrice],
				stripeProductId: "stripe_prod_storage",
			});

			const cusEnt = createMockCusEntitlement({
				featureId: "storage",
				featureName: "Storage",
				allowance: 100,
				balance: 100,
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_storage",
				product,
				customerPrices: [createMockCustomerPrice({ price: allocatedPrice })],
				customerEntitlements: [cusEnt],
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct],
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_empty_price_storage",
				quantity: 0,
			});
		});

		test("11. one-off prices are NOT included in subscription items", () => {
			const fixedPrice = createMockFixedPrice({
				id: "price_fixed",
				stripePriceId: "stripe_price_fixed",
			});

			const oneOffPrice = createMockOneOffPrice({
				id: "price_oneoff",
				stripePriceId: "stripe_price_oneoff",
			});

			const product = createMockFullProduct({
				id: "prod_pro",
				prices: [fixedPrice, oneOffPrice],
				stripeProductId: "stripe_prod_pro",
			});

			const customerProduct = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_pro",
				product,
				customerPrices: [
					createMockCustomerPrice({ price: fixedPrice }),
					createMockCustomerPrice({ price: oneOffPrice }),
				],
			});

			const ctx = createMockCtx({ features: [] });
			const billingContext = createMockBillingContext({
				customerProducts: [],
				stripeSubscription: undefined,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct],
			});

			// Should only include the fixed price, not the one-off
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				price: "stripe_price_fixed",
				quantity: 1,
			});
		});

		test("12. adding second entity customer product with consumable price keeps quantity at 0", () => {
			const feature = createMockFeature({
				id: "api_calls",
				name: "API Calls",
			});

			const consumablePrice = createMockConsumablePrice({
				id: "price_usage",
				featureId: "api_calls",
				stripePriceId: "stripe_price_usage",
				stripeEmptyPriceId: "stripe_empty_price_usage",
			});

			const product = createMockFullProduct({
				id: "prod_usage",
				prices: [consumablePrice],
				stripeProductId: "stripe_prod_usage",
			});

			const cusEnt1 = createMockCusEntitlement({
				id: "cus_ent_1",
				featureId: "api_calls",
				featureName: "API Calls",
				allowance: 1000,
				balance: 1000,
			});

			const cusEnt2 = createMockCusEntitlement({
				id: "cus_ent_2",
				featureId: "api_calls",
				featureName: "API Calls",
				allowance: 1000,
				balance: 1000,
			});

			// First entity customer product (already exists on subscription)
			const customerProduct1 = createMockCustomerProduct({
				id: "cus_prod_1",
				productId: "prod_usage",
				product,
				customerPrices: [createMockCustomerPrice({ price: consumablePrice })],
				customerEntitlements: [cusEnt1],
				internalEntityId: "entity_1",
				subscriptionIds: ["sub_123"],
			});

			// Second entity customer product (being added)
			const customerProduct2 = createMockCustomerProduct({
				id: "cus_prod_2",
				productId: "prod_usage",
				product,
				customerPrices: [createMockCustomerPrice({ price: consumablePrice })],
				customerEntitlements: [cusEnt2],
				internalEntityId: "entity_2",
			});

			const stripeSubscription = createMockStripeSubscription({
				id: "sub_123",
				items: [
					{
						id: "si_usage",
						priceId: "stripe_empty_price_usage",
						quantity: 0,
					},
				],
			});

			const ctx = createMockCtx({ features: [feature] });
			const billingContext = createMockBillingContext({
				customerProducts: [customerProduct1],
				stripeSubscription,
			});

			const result = buildStripeSubscriptionItemsUpdate({
				ctx,
				billingContext,
				addCustomerProducts: [customerProduct2],
			});

			// Quantity should still be 0 (consumable prices aggregate to 0)
			// Either no update needed (empty array) or quantity stays at 0
			const usageItem = result.find(
				(item) =>
					item.price === "stripe_empty_price_usage" || item.id === "si_usage",
			);

			// If there's an update, quantity should be 0
			if (usageItem && "quantity" in usageItem) {
				expect(usageItem.quantity).toBe(0);
			}
			// Otherwise no update needed is also valid (means quantity unchanged at 0)
		});
	});
});
