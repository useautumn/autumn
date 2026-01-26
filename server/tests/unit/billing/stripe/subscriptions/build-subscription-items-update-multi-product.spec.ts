/**
 * Multi-product tests for buildStripeSubscriptionItemsUpdate.
 *
 * These cover complex scenarios with multiple customer products:
 * - Multiple entities with same/different products
 * - Customer + entity combinations
 * - Main + add-on products
 * - Quantity aggregation
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions";
import chalk from "chalk";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import {
	createCustomerPricesForProduct,
	createProductWithAllPriceTypes,
	createStripeItemsFromProduct,
	expectSubscriptionItemsUpdate,
	getExpectedNewProductItems,
	getStripePriceIds,
} from "../stripeSubscriptionTestHelpers";

// ============ TESTS ============

describe(
	chalk.yellowBright("buildStripeSubscriptionItemsUpdate - Multi-Product"),
	() => {
		describe(chalk.cyan("Multiple Entities - Same Product"), () => {
			test("Two entities with same product (prices merged, quantities summed)", () => {
				// Each entity needs its own product helper with its own customerProductId
				const pro1 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const pro2 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity2",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Entity 1 Pro
				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro1.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro1.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro1.allEntitlements,
					options: pro1.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity 2 Pro (same product, same quantities)
				const entity2ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity2",
					productId: "pro",
					product: pro2.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro2.allPrices,
						customerProductId: "cus_prod_pro_entity2",
					}),
					customerEntitlements: pro2.allEntitlements,
					options: pro2.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entity1ProProduct, entity2ProProduct],
				});

				// Should have 4 items (prices merged)
				expect(result).toHaveLength(4);

				// Fixed: 1 + 1 = 2
				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				// Prepaid: 100 + 100 = 200
				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(200);

				// Consumable (entities use empty price): 0 + 0 = 0
				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem?.price).toBe("stripe_pro_consumable_empty");
				expect(consumableItem?.quantity).toBe(0);

				// Allocated: 5 + 5 = 10
				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(10);
			});

			test("Three entities with same product, different prepaid quantities", () => {
				const pro1 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 50,
					allocatedUsage: 2,
				});

				const pro2 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity2",
					prepaidQuantity: 75,
					allocatedUsage: 3,
				});

				const pro3 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity3",
					prepaidQuantity: 125,
					allocatedUsage: 5,
				});

				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro1.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro1.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro1.allEntitlements,
					options: pro1.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const entity2ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity2",
					productId: "pro",
					product: pro2.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro2.allPrices,
						customerProductId: "cus_prod_pro_entity2",
					}),
					customerEntitlements: pro2.allEntitlements,
					options: pro2.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const entity3ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity3",
					productId: "pro",
					product: pro3.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro3.allPrices,
						customerProductId: "cus_prod_pro_entity3",
					}),
					customerEntitlements: pro3.allEntitlements,
					options: pro3.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_3",
					entityId: "entity_3",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [
						entity1ProProduct,
						entity2ProProduct,
						entity3ProProduct,
					],
				});

				expect(result).toHaveLength(4);

				// Fixed: 1 + 1 + 1 = 3
				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(3);

				// Prepaid: 50 + 75 + 125 = 250
				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(250);

				// Allocated: 2 + 3 + 5 = 10
				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(10);
			});

			test("Add second entity to existing subscription", () => {
				// Each entity needs its own product helper
				const pro1 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const pro2 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity2",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Entity 1 - already exists
				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro1.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro1.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro1.allEntitlements,
					options: pro1.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
					subscriptionIds: ["sub_123"],
				});

				// Entity 2 - being added (needs subscription ID to be included)
				const entity2ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity2",
					productId: "pro",
					product: pro2.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro2.allPrices,
						customerProductId: "cus_prod_pro_entity2",
					}),
					customerEntitlements: pro2.allEntitlements,
					options: pro2.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
					subscriptionIds: ["sub_123"],
				});

				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: createStripeItemsFromProduct(pro1, { isEntityLevel: true }),
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [entity1ProProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entity1ProProduct, entity2ProProduct],
				});

				// Should update quantities (double them)
				expect(result).toHaveLength(3); // fixed, prepaid, allocated (consumable stays 0)

				const fixedItem = result.find((item) => item.id?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				const prepaidItem = result.find((item) => item.id?.includes("prepaid"));
				expect(prepaidItem?.quantity).toBe(200);

				const allocatedItem = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(10);
			});

			test("Remove one entity from two-entity subscription", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Only Entity 1 remains
				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
					subscriptionIds: ["sub_123"],
				});

				// Current subscription has 2 entities worth of quantities
				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: [
						{
							id: "si_pro_fixed",
							priceId: "stripe_pro_fixed",
							quantity: 2,
						},
						{
							id: "si_pro_prepaid",
							priceId: "stripe_pro_prepaid",
							quantity: 200,
						},
						{
							id: "si_pro_consumable",
							priceId: "stripe_pro_consumable_empty",
							quantity: 0,
						},
						{
							id: "si_pro_allocated",
							priceId: "stripe_pro_allocated",
							quantity: 10,
						},
					],
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [entity1ProProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entity1ProProduct],
				});

				// Should update quantities (halve them)
				expect(result).toHaveLength(3); // fixed, prepaid, allocated

				const fixedItem = result.find((item) => item.id?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(1);

				const prepaidItem = result.find((item) => item.id?.includes("prepaid"));
				expect(prepaidItem?.quantity).toBe(100);

				const allocatedItem = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(5);
			});
		});

		describe(chalk.cyan("Multiple Entities - Different Products"), () => {
			test("Two entities with different products", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity2",
					prepaidQuantity: 200,
					allocatedUsage: 10,
				});

				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const entity2PremiumProduct = customerProducts.create({
					id: "cus_prod_premium_entity2",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity2",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entity1ProProduct, entity2PremiumProduct],
				});

				// Should have 8 items (4 for each product)
				expect(result).toHaveLength(8);

				// Verify Pro items
				const proItems = result.filter((item) => item.price?.includes("pro_"));
				expect(proItems).toHaveLength(4);

				// Verify Premium items
				const premiumItems = result.filter((item) =>
					item.price?.includes("premium_"),
				);
				expect(premiumItems).toHaveLength(4);
			});
		});

		describe(chalk.cyan("Customer + Entity - Same Product"), () => {
			test("Customer Pro + Entity Pro (both active)", () => {
				const proCustomer = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const proEntity = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

				// Customer Pro
				const customerProProduct = customerProducts.create({
					id: "cus_prod_pro_customer",
					productId: "pro",
					product: proCustomer.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proCustomer.allPrices,
						customerProductId: "cus_prod_pro_customer",
					}),
					customerEntitlements: proCustomer.allEntitlements,
					options: proCustomer.allOptions,
					status: CusProductStatus.Active,
				});

				// Entity Pro
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity",
					productId: "pro",
					product: proEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity.allPrices,
						customerProductId: "cus_prod_pro_entity",
					}),
					customerEntitlements: proEntity.allEntitlements,
					options: proEntity.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerProProduct, entityProProduct],
				});

				// Should have 5 items:
				// - fixed (1+1=2)
				// - prepaid (100+50=150)
				// - allocated (5+3=8)
				// - consumable metered (customer)
				// - consumable empty (entity)
				expect(result).toHaveLength(5);

				// Fixed: 1 + 1 = 2
				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				// Prepaid: 100 + 50 = 150
				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(150);

				// Allocated: 5 + 3 = 8
				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(8);

				// Both consumable prices should be present
				const consumableMetered = result.find(
					(item) => item.price === "stripe_pro_consumable",
				);
				const consumableEmpty = result.find(
					(item) => item.price === "stripe_pro_consumable_empty",
				);
				expect(consumableMetered).toBeDefined();
				expect(consumableEmpty).toBeDefined();
				expect(consumableEmpty?.quantity).toBe(0);
				// Metered should not have quantity
				expect("quantity" in (consumableMetered ?? {})).toBe(false);
			});

			test("Customer Pro cancels, Entity Pro stays", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				// Only Entity Pro remains
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
					subscriptionIds: ["sub_123"],
				});

				// Current subscription has both customer and entity
				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: [
						{ id: "si_pro_fixed", priceId: "stripe_pro_fixed", quantity: 2 },
						{
							id: "si_pro_prepaid",
							priceId: "stripe_pro_prepaid",
							quantity: 200,
						},
						{
							id: "si_pro_consumable",
							priceId: "stripe_pro_consumable",
							quantity: 0,
						},
						{
							id: "si_pro_consumable_empty",
							priceId: "stripe_pro_consumable_empty",
							quantity: 0,
						},
						{
							id: "si_pro_allocated",
							priceId: "stripe_pro_allocated",
							quantity: 10,
						},
					],
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [entityProProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [entityProProduct],
				});

				// Should update quantities and remove metered consumable
				// Fixed: 2 -> 1
				const fixedItem = result.find((item) => item.id === "si_pro_fixed");
				expect(fixedItem?.quantity).toBe(1);

				// Prepaid: 200 -> 100
				const prepaidItem = result.find((item) => item.id === "si_pro_prepaid");
				expect(prepaidItem?.quantity).toBe(100);

				// Allocated: 10 -> 5
				const allocatedItem = result.find(
					(item) => item.id === "si_pro_allocated",
				);
				expect(allocatedItem?.quantity).toBe(5);

				// Metered consumable should be deleted
				const deletedMetered = result.find(
					(item) => item.id === "si_pro_consumable" && item.deleted,
				);
				expect(deletedMetered).toBeDefined();
			});
		});

		describe(chalk.cyan("Customer + Entity - Different Products"), () => {
			test("Customer Premium + Entity Pro", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_customer",
					prepaidQuantity: 200,
					allocatedUsage: 10,
				});

				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

				// Customer Premium
				const customerPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_customer",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_customer",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				// Entity Pro
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [customerPremiumProduct, entityProProduct],
				});

				// Should have 8 items (4 for each product, different price IDs)
				expect(result).toHaveLength(8);

				// Verify Premium items
				const premiumItems = result.filter((item) =>
					item.price?.includes("premium_"),
				);
				expect(premiumItems).toHaveLength(4);

				// Verify Pro items
				const proItems = result.filter((item) => item.price?.includes("pro_"));
				expect(proItems).toHaveLength(4);
			});
		});

		describe(chalk.cyan("Main + Add-on Products"), () => {
			test("Main product Pro + Add-on Credits", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const addOnCredits = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
					prepaidQuantity: 500,
					allocatedUsage: 0,
				});

				// Main Pro
				const proCustomerProduct = customerProducts.create({
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
				});

				// Add-on Credits
				const addOnCustomerProduct = customerProducts.create({
					id: "cus_prod_addon",
					productId: "addon_credits",
					product: addOnCredits.product,
					customerPrices: createCustomerPricesForProduct({
						prices: addOnCredits.allPrices,
						customerProductId: "cus_prod_addon",
					}),
					customerEntitlements: addOnCredits.allEntitlements,
					options: addOnCredits.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
				});

				// Should have 8 items (4 for main, 4 for add-on)
				expect(result).toHaveLength(8);

				// Verify Pro items
				const proItems = result.filter((item) => item.price?.includes("pro_"));
				expect(proItems).toHaveLength(4);

				// Verify Add-on items
				const addOnItems = result.filter((item) =>
					item.price?.includes("addon_"),
				);
				expect(addOnItems).toHaveLength(4);
			});

			test("Main Pro + Add-on exists, remove add-on", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro",
				});

				const addOnCredits = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
				});

				// Only Main Pro remains
				const proCustomerProduct = customerProducts.create({
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

				// Subscription has both main and add-on (customer-level, so 3 items each - no metered)
				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: [
						...createStripeItemsFromProduct(pro, {
							isEntityLevel: false,
							itemIdPrefix: "si_pro",
						}),
						...createStripeItemsFromProduct(addOnCredits, {
							isEntityLevel: false,
							itemIdPrefix: "si_addon",
						}),
					],
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [proCustomerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proCustomerProduct],
				});

				// Should delete 3 add-on items (customer-level doesn't include metered)
				const deletedItems = result.filter((item) => item.deleted === true);
				expect(deletedItems).toHaveLength(3);

				// All deleted items should be add-on items
				const deletedAddOnItems = deletedItems.filter((item) =>
					item.id?.includes("addon"),
				);
				expect(deletedAddOnItems).toHaveLength(3);
			});

			test("Add add-on to existing main product", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro",
				});

				const addOnCredits = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
					prepaidQuantity: 1000,
				});

				// Main Pro (existing)
				const proCustomerProduct = customerProducts.create({
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

				// Add-on Credits (being added - needs subscription ID to be included)
				const addOnCustomerProduct = customerProducts.create({
					id: "cus_prod_addon",
					productId: "addon_credits",
					product: addOnCredits.product,
					customerPrices: createCustomerPricesForProduct({
						prices: addOnCredits.allPrices,
						customerProductId: "cus_prod_addon",
					}),
					customerEntitlements: addOnCredits.allEntitlements,
					options: addOnCredits.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: ["sub_123"],
				});

				// Existing subscription has main Pro only (customer-level, no metered)
				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: createStripeItemsFromProduct(pro, { isEntityLevel: false }),
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [proCustomerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
				});

				// Should add 4 new add-on items (+ 1 metered for main pro that wasn't in existing)
				const newItems = result.filter(
					(item) => item.price !== undefined && !item.deleted,
				);
				expect(newItems).toHaveLength(5); // 4 add-on + 1 pro metered

				// Should have 4 add-on items
				const newAddOnItems = newItems.filter((item) =>
					item.price?.includes("addon_"),
				);
				expect(newAddOnItems).toHaveLength(4);
			});
		});

		describe(chalk.cyan("Complex Multi-Entity Scenarios"), () => {
			test("Customer Premium + Entity 1 Pro + Entity 2 Pro", () => {
				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_customer",
					prepaidQuantity: 200,
					allocatedUsage: 10,
				});

				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

				// Customer Premium
				const customerPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_customer",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_customer",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
				});

				// Entity 1 Pro
				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity 2 Pro
				const entity2ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity2",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_entity2",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [
						customerPremiumProduct,
						entity1ProProduct,
						entity2ProProduct,
					],
				});

				// Premium: 4 items
				// Pro: 4 items (entities merged)
				expect(result).toHaveLength(8);

				// Verify Premium items
				const premiumFixed = result.find(
					(item) => item.price === "stripe_premium_fixed",
				);
				expect(premiumFixed?.quantity).toBe(1);

				// Verify Pro items (2 entities, so doubled)
				const proFixed = result.find(
					(item) => item.price === "stripe_pro_fixed",
				);
				expect(proFixed?.quantity).toBe(2);

				const proPrepaid = result.find(
					(item) => item.price === "stripe_pro_prepaid",
				);
				expect(proPrepaid?.quantity).toBe(100); // 50 + 50
			});

			test("Multiple products with same price ID aggregates correctly", () => {
				// Two customer products that share the same stripe price IDs
				const pro1 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
				});

				const pro2 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_2",
					prepaidQuantity: 150,
					allocatedUsage: 8,
				});

				const proProduct1 = customerProducts.create({
					id: "cus_prod_pro_1",
					productId: "pro",
					product: pro1.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro1.allPrices,
						customerProductId: "cus_prod_pro_1",
					}),
					customerEntitlements: pro1.allEntitlements,
					options: pro1.allOptions,
					status: CusProductStatus.Active,
				});

				const proProduct2 = customerProducts.create({
					id: "cus_prod_pro_2",
					productId: "pro",
					product: pro2.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro2.allPrices,
						customerProductId: "cus_prod_pro_2",
					}),
					customerEntitlements: pro2.allEntitlements,
					options: pro2.allOptions,
					status: CusProductStatus.Active,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proProduct1, proProduct2],
				});

				// Same price IDs should be merged:
				// - fixed, prepaid, allocated (licensed - quantities summed)
				// - consumable metered (both undefined, merged to single item)
				expect(result).toHaveLength(4);

				// Fixed: 1 + 1 = 2
				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				// Prepaid: 100 + 150 = 250
				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(250);

				// Allocated: 5 + 8 = 13
				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(13);

				// Consumable metered (merged, no quantity)
				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem).toBeDefined();
				expect("quantity" in (consumableItem ?? {})).toBe(false);
			});
		});

		describe(chalk.cyan("Subscription Filtering"), () => {
			test("Only includes customer products for the target subscription", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro",
				});

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				// Pro on sub_123
				const proCustomerProduct = customerProducts.create({
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

				// Premium on sub_456 (different subscription)
				const premiumCustomerProduct = customerProducts.create({
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
					subscriptionIds: ["sub_456"],
				});

				// Customer-level subscription has 3 items (no metered consumable)
				const stripeSubscription = stripeSubscriptions.create({
					id: "sub_123",
					items: createStripeItemsFromProduct(pro, { isEntityLevel: false }),
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [proCustomerProduct, premiumCustomerProduct],
					stripeSubscription,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					finalCustomerProducts: [proCustomerProduct, premiumCustomerProduct],
				});

				// Should only process Pro (on sub_123), not Premium (on sub_456)
				// Pro needs to add metered consumable (wasn't in stripe subscription)
				// Premium is filtered out entirely
				expect(result).toHaveLength(1);
				expect(result[0].price).toBe("stripe_pro_consumable");
			});
		});
	},
);
