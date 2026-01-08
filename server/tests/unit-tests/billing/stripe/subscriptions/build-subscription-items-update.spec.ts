/**
 * Single product tests for buildStripeSubscriptionItemsUpdate.
 *
 * These cover fundamental scenarios with a single customer product containing
 * all price types (fixed, prepaid, consumable, allocated).
 *
 * For multi-product scenarios (multiple entities, customer + entity, main + add-on),
 * see build-subscription-items-update-multi-product.spec.ts
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { createMockCtx } from "@tests/utils/mockUtils/contextMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import {
	createMockCustomerPrice,
	createMockOneOffPrice,
} from "@tests/utils/mockUtils/priceMocks";
import chalk from "chalk";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { createMockBillingContext } from "../billingContextMocks";
import {
	createCustomerPricesForProduct,
	createProductWithAllPriceTypes,
	createStripeItemsFromProduct,
	expectSubscriptionItemsUpdate,
	getExpectedNewProductItems,
} from "../stripeSubscriptionTestHelpers";
import { createMockStripeSubscription } from "../stripeSubscriptionMocks";

// ============ TESTS ============

describe(
	chalk.yellowBright("buildStripeSubscriptionItemsUpdate - Single Product"),
	() => {
		describe(chalk.cyan("No Existing Subscription - New Products"), () => {
			test("Customer-level product with all price types", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should create 4 items (fixed, prepaid, consumable, allocated)
				expect(result).toHaveLength(4);
				expectSubscriptionItemsUpdate(
					result,
					getExpectedNewProductItems(premium, { isEntityLevel: false }),
				);
			});

			test("Entity-level product with all price types", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

				const entityCustomerProduct = createMockCustomerProduct({
					id: "cus_prod_premium_entity",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entityCustomerProduct],
				});

				// Should create 4 items (fixed, prepaid, consumable empty, allocated)
				expect(result).toHaveLength(4);
				expectSubscriptionItemsUpdate(
					result,
					getExpectedNewProductItems(premium, { isEntityLevel: true }),
				);
			});

			test("Customer-level product with custom prepaid quantity", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 250, // Custom quantity
					allocatedUsage: 8,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				expect(result).toHaveLength(4);

				// Verify prepaid quantity is correct
				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(250);

				// Verify allocated quantity is correct
				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(8);
			});
		});

		describe(chalk.cyan("Existing Subscription - Quantity Updates"), () => {
			test("Update prepaid quantity (increase)", () => {
				// Original: prepaid=100, allocated=5
				const premiumOriginal = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Updated: prepaid=200, allocated=5 (same)
				const premiumUpdated = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 200,
					allocatedUsage: 5,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premiumUpdated.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumUpdated.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premiumUpdated.allEntitlements,
					options: premiumUpdated.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				// Note: Customer-level products don't include metered consumable in stripe items
				// because metered prices have undefined quantity and can't be meaningfully compared
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premiumOriginal, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [customerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should update prepaid and add metered consumable (which wasn't in existing subscription)
				expect(result).toHaveLength(2);

				const prepaidUpdate = result.find((item) =>
					item.id?.includes("prepaid"),
				);
				expect(prepaidUpdate).toEqual({
					id: "si_premium_prepaid",
					quantity: 200,
				});

				// Metered consumable gets added since it wasn't in the stripe subscription
				const consumableAdd = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableAdd?.price).toBe("stripe_premium_consumable");
			});

			test("Update allocated usage (increase)", () => {
				// Original: prepaid=100, allocated=5
				const premiumOriginal = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Updated: prepaid=100 (same), allocated=10
				const premiumUpdated = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 10,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premiumUpdated.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumUpdated.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premiumUpdated.allEntitlements,
					options: premiumUpdated.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premiumOriginal, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [customerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should update allocated and add metered consumable
				expect(result).toHaveLength(2);

				const allocatedUpdate = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedUpdate).toEqual({
					id: "si_premium_allocated",
					quantity: 10,
				});
			});

			test("Update multiple quantities (prepaid and allocated)", () => {
				// Original: prepaid=100, allocated=5
				const premiumOriginal = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Updated: prepaid=150, allocated=8
				const premiumUpdated = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 150,
					allocatedUsage: 8,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premiumUpdated.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumUpdated.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premiumUpdated.allEntitlements,
					options: premiumUpdated.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premiumOriginal, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [customerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should update prepaid, allocated, and add metered consumable
				expect(result).toHaveLength(3);

				const prepaidUpdate = result.find((item) =>
					item.id?.includes("prepaid"),
				);
				expect(prepaidUpdate?.quantity).toBe(150);

				const allocatedUpdate = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedUpdate?.quantity).toBe(8);
			});

			test("Decrease quantity (prepaid)", () => {
				// Original: prepaid=200
				const premiumOriginal = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 200,
					allocatedUsage: 5,
				});

				// Updated: prepaid=50
				const premiumUpdated = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 50,
					allocatedUsage: 5,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premiumUpdated.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumUpdated.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premiumUpdated.allEntitlements,
					options: premiumUpdated.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premiumOriginal, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [customerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should update prepaid and add metered consumable
				expect(result).toHaveLength(2);

				const prepaidUpdate = result.find((item) =>
					item.id?.includes("prepaid"),
				);
				expect(prepaidUpdate).toEqual({
					id: "si_premium_prepaid",
					quantity: 50,
				});
			});
		});

		describe(chalk.cyan("Existing Subscription - No Changes"), () => {
			test("Same product, same quantities returns only metered addition", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				// Note: Customer-level subscription doesn't include metered consumable
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premium, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [customerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Only the metered consumable needs to be added (wasn't in existing subscription)
				expect(result).toHaveLength(1);
				expect(result[0].price).toBe("stripe_premium_consumable");
			});

			test("Entity product, same quantities returns empty array", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const entityCustomerProduct = createMockCustomerProduct({
					id: "cus_prod_premium_entity",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity-level includes the empty price with quantity 0
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premium, { isEntityLevel: true }),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [entityCustomerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entityCustomerProduct],
				});

				// No changes needed - all quantities match
				expect(result).toHaveLength(0);
			});
		});

		describe(chalk.cyan("Existing Subscription - Product Removal"), () => {
			test("Remove all products marks all items as deleted", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				// Customer-level subscription has 3 items (no metered consumable)
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premium, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [],
				});

				// Should delete all 3 items (fixed, prepaid, allocated)
				expect(result).toHaveLength(3);
				expectSubscriptionItemsUpdate(result, [
					{ id: "si_premium_fixed", deleted: true },
					{ id: "si_premium_prepaid", deleted: true },
					{ id: "si_premium_allocated", deleted: true },
				]);
			});

			test("Remove entity product marks all items including consumable as deleted", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity",
				});

				// Entity-level subscription has 4 items (including empty consumable)
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premium, { isEntityLevel: true }),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [],
				});

				// Should delete all 4 items
				expect(result).toHaveLength(4);
				expectSubscriptionItemsUpdate(result, [
					{ id: "si_premium_fixed", deleted: true },
					{ id: "si_premium_prepaid", deleted: true },
					{ id: "si_premium_consumable", deleted: true },
					{ id: "si_premium_allocated", deleted: true },
				]);
			});
		});

		describe(chalk.cyan("Product Transition (Single to Single)"), () => {
			test("Switch from Premium to Pro (different products)", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro",
				});

				// New product (Pro) - needs subscription ID to be included in the update
				const proCustomerProduct = createMockCustomerProduct({
					id: "cus_prod_pro",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				// Existing subscription has Premium (without metered consumable)
				const stripeSubscription = createMockStripeSubscription({
					id: "sub_123",
					items: createStripeItemsFromProduct(premium, {
						isEntityLevel: false,
					}),
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proCustomerProduct],
				});

				// Should delete 3 Premium items (fixed, prepaid, allocated - no metered in mock)
				// and add 4 Pro items
				expect(result).toHaveLength(7);

				// Verify deletions (premium items)
				const deletions = result.filter((item) => item.deleted === true);
				expect(deletions).toHaveLength(3);

				// Verify additions (pro items)
				const additions = result.filter(
					(item) => item.price !== undefined && !item.deleted,
				);
				expect(additions).toHaveLength(4);

				// Verify pro items are added
				const proItems = additions.filter((item) =>
					item.price?.includes("pro_"),
				);
				expect(proItems).toHaveLength(4);
			});
		});

		describe(chalk.cyan("One-Off Prices Exclusion"), () => {
			test("One-off prices are NOT included in subscription items", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				// Add a one-off price to the product
				const oneOffPrice = createMockOneOffPrice({
					id: "premium_oneoff",
					stripePriceId: "stripe_premium_oneoff",
				});

				const allPricesWithOneOff = [...premium.allPrices, oneOffPrice];

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: {
						...premium.product,
						prices: allPricesWithOneOff,
					},
					customerPrices: [
						...createCustomerPricesForProduct({
							prices: premium.allPrices,
							customerProductId: "cus_prod_premium",
						}),
						createMockCustomerPrice({
							price: oneOffPrice,
							customerProductId: "cus_prod_premium",
						}),
					],
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Should only include the 4 recurring items, not the one-off
				expect(result).toHaveLength(4);

				// Verify one-off price is NOT included
				const hasOneOff = result.some(
					(item) => item.price === "stripe_premium_oneoff",
				);
				expect(hasOneOff).toBe(false);
			});
		});

		describe(chalk.cyan("Edge Cases"), () => {
			test("No stripe subscription and no products returns empty array", () => {
				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [],
				});

				expect(result).toHaveLength(0);
			});

			test("Entity-level consumable uses stripe_empty_price_id with quantity 0", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity",
				});

				const entityCustomerProduct = createMockCustomerProduct({
					id: "cus_prod_premium_entity",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entityCustomerProduct],
				});

				// Find the consumable item
				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem).toBeDefined();
				expect(consumableItem?.price).toBe("stripe_premium_consumable_empty");
				expect(consumableItem?.quantity).toBe(0);
			});

			test("Customer-level consumable (metered) has no quantity", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				const customerProduct = createMockCustomerProduct({
					id: "cus_prod_premium",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = createMockCtx({ features: [] });
				const billingContext = createMockBillingContext({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProduct],
				});

				// Find the consumable item
				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem).toBeDefined();
				expect(consumableItem?.price).toBe("stripe_premium_consumable");
				// Metered prices should NOT have quantity
				expect("quantity" in (consumableItem ?? {})).toBe(false);
			});
		});
	},
);
