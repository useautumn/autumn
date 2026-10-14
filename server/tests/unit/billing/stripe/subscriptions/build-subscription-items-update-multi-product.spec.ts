import { describe, expect, test } from "bun:test";
import { CusProductStatus, ProcessorType } from "@autumn/shared";
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

describe(
	chalk.yellowBright("buildStripeSubscriptionItemsUpdate - Multi-Product"),
	() => {
		describe(chalk.cyan("Multiple Entities - Same Product"), () => {
			test("Two entities with same product (prices merged, quantities summed)", () => {
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

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [entity1ProProduct, entity2ProProduct],
					} as never,
					finalCustomerProducts: [entity1ProProduct, entity2ProProduct],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(200);

				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem?.price).toBe("stripe_pro_consumable");
				expect("quantity" in (consumableItem ?? {})).toBe(false);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [
							entity1ProProduct,
							entity2ProProduct,
							entity3ProProduct,
						],
					} as never,
					finalCustomerProducts: [
						entity1ProProduct,
						entity2ProProduct,
						entity3ProProduct,
					],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(3);

				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(250);

				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(10);
			});

			test("Add second entity to existing subscription", () => {
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [entity1ProProduct, entity2ProProduct],
					} as never,
					finalCustomerProducts: [entity1ProProduct, entity2ProProduct],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.id?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				const prepaidItem = result.find((item) => item.id?.includes("prepaid"));
				expect(prepaidItem?.quantity).toBe(200);

				const allocatedItem = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(10);

				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem).toBeDefined();
			});

			test("Remove one entity from two-entity subscription", () => {
				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 100,
					allocatedUsage: 5,
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
					subscriptionIds: ["sub_123"],
				});

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [entity1ProProduct],
					} as never,
					finalCustomerProducts: [entity1ProProduct],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.id?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(1);

				const prepaidItem = result.find((item) => item.id?.includes("prepaid"));
				expect(prepaidItem?.quantity).toBe(100);

				const allocatedItem = result.find((item) =>
					item.id?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(5);

				const consumableItem = result.find((item) =>
					item.price?.includes("consumable"),
				);
				expect(consumableItem).toBeDefined();
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [entity1ProProduct, entity2PremiumProduct],
					} as never,
					finalCustomerProducts: [entity1ProProduct, entity2PremiumProduct],
				});

				expect(result).toHaveLength(8);

				const proItems = result.filter((item) => item.price?.includes("pro_"));
				expect(proItems).toHaveLength(4);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [customerProProduct, entityProProduct],
					} as never,
					finalCustomerProducts: [customerProProduct, entityProProduct],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(150);

				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(8);

				const consumableMetered = result.find(
					(item) => item.price === "stripe_pro_consumable",
				);
				expect(consumableMetered).toBeDefined();
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [entityProProduct],
					} as never,
					finalCustomerProducts: [entityProProduct],
				});

				const fixedItem = result.find((item) => item.id === "si_pro_fixed");
				expect(fixedItem?.quantity).toBe(1);

				const prepaidItem = result.find((item) => item.id === "si_pro_prepaid");
				expect(prepaidItem?.quantity).toBe(100);

				const allocatedItem = result.find(
					(item) => item.id === "si_pro_allocated",
				);
				expect(allocatedItem?.quantity).toBe(5);

				const consumableItem = result.find(
					(item) => item.price === "stripe_pro_consumable",
				);
				expect(consumableItem).toBeDefined();
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [customerPremiumProduct, entityProProduct],
					} as never,
					finalCustomerProducts: [customerPremiumProduct, entityProProduct],
				});

				expect(result).toHaveLength(8);

				const premiumItems = result.filter((item) =>
					item.price?.includes("premium_"),
				);
				expect(premiumItems).toHaveLength(4);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
					} as never,
					finalCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
				});

				expect(result).toHaveLength(8);

				const proItems = result.filter((item) => item.price?.includes("pro_"));
				expect(proItems).toHaveLength(4);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [proCustomerProduct],
					} as never,
					finalCustomerProducts: [proCustomerProduct],
				});

				const deletedItems = result.filter((item) => item.deleted === true);
				expect(deletedItems).toHaveLength(3);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
					} as never,
					finalCustomerProducts: [proCustomerProduct, addOnCustomerProduct],
				});

				const newItems = result.filter(
					(item) => item.price !== undefined && !item.deleted,
				);
				expect(newItems).toHaveLength(5);
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

				const proEntity1 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

				const proEntity2 = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity2",
					prepaidQuantity: 50,
					allocatedUsage: 3,
				});

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

				const entity1ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: proEntity1.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity1.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: proEntity1.allEntitlements,
					options: proEntity1.allOptions,
					status: CusProductStatus.Active,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const entity2ProProduct = customerProducts.create({
					id: "cus_prod_pro_entity2",
					productId: "pro",
					product: proEntity2.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity2.allPrices,
						customerProductId: "cus_prod_pro_entity2",
					}),
					customerEntitlements: proEntity2.allEntitlements,
					options: proEntity2.allOptions,
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [
							customerPremiumProduct,
							entity1ProProduct,
							entity2ProProduct,
						],
					} as never,
					finalCustomerProducts: [
						customerPremiumProduct,
						entity1ProProduct,
						entity2ProProduct,
					],
				});

				expect(result).toHaveLength(8);

				const premiumFixed = result.find(
					(item) => item.price === "stripe_premium_fixed",
				);
				expect(premiumFixed?.quantity).toBe(1);

				const proFixed = result.find(
					(item) => item.price === "stripe_pro_fixed",
				);
				expect(proFixed?.quantity).toBe(2);

				const proPrepaid = result.find(
					(item) => item.price === "stripe_pro_prepaid",
				);
				expect(proPrepaid?.quantity).toBe(100);
			});

			test("Multiple products with same price ID aggregates correctly", () => {
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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [proProduct1, proProduct2],
					} as never,
					finalCustomerProducts: [proProduct1, proProduct2],
				});

				expect(result).toHaveLength(4);

				const fixedItem = result.find((item) => item.price?.includes("fixed"));
				expect(fixedItem?.quantity).toBe(2);

				const prepaidItem = result.find((item) =>
					item.price?.includes("prepaid"),
				);
				expect(prepaidItem?.quantity).toBe(250);

				const allocatedItem = result.find((item) =>
					item.price?.includes("allocated"),
				);
				expect(allocatedItem?.quantity).toBe(13);

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
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [
							proCustomerProduct,
							premiumCustomerProduct,
						],
					} as never,
					finalCustomerProducts: [proCustomerProduct, premiumCustomerProduct],
				});

				expect(result).toHaveLength(1);
				expect(result[0].price).toBe("stripe_pro_consumable");
			});
		});

		describe(chalk.cyan("Processor Filtering"), () => {
			test("Excludes RevenueCat-managed products when attaching a Stripe add-on (no existing subscription)", () => {
				const rcMain = createProductWithAllPriceTypes({
					productId: "runable_pro_25_monthly",
					productName: "Pro 25 Monthly (RevenueCat)",
					customerProductId: "cus_prod_rc_main",
				});

				const stripeAddOn = createProductWithAllPriceTypes({
					productId: "runable_topup_25",
					productName: "Topup 25",
					customerProductId: "cus_prod_topup",
					isAddOn: true,
				});

				const rcMainCustomerProduct = customerProducts.create({
					id: "cus_prod_rc_main",
					productId: "runable_pro_25_monthly",
					product: rcMain.product,
					customerPrices: createCustomerPricesForProduct({
						prices: rcMain.allPrices,
						customerProductId: "cus_prod_rc_main",
					}),
					customerEntitlements: rcMain.allEntitlements,
					options: rcMain.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: [],
					processorType: ProcessorType.RevenueCat,
				});

				const stripeAddOnCustomerProduct = customerProducts.create({
					id: "cus_prod_topup",
					productId: "runable_topup_25",
					product: stripeAddOn.product,
					customerPrices: createCustomerPricesForProduct({
						prices: stripeAddOn.allPrices,
						customerProductId: "cus_prod_topup",
					}),
					customerEntitlements: stripeAddOn.allEntitlements,
					options: stripeAddOn.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: [],
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [rcMainCustomerProduct, stripeAddOnCustomerProduct],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [
							rcMainCustomerProduct,
							stripeAddOnCustomerProduct,
						],
					} as never,
					finalCustomerProducts: [
						rcMainCustomerProduct,
						stripeAddOnCustomerProduct,
					],
				});

				const rcPriceIds = getStripePriceIds(rcMain);
				for (const item of result) {
					expect(rcPriceIds).not.toContain(item.price);
				}

				const expectedItems = getExpectedNewProductItems(stripeAddOn);
				expectSubscriptionItemsUpdate(result, expectedItems);
			});

			test("Excludes RevenueCat product even when only RC products are present", () => {
				const rcMain = createProductWithAllPriceTypes({
					productId: "rc_only",
					productName: "RC Only",
					customerProductId: "cus_prod_rc_only",
				});

				const rcMainCustomerProduct = customerProducts.create({
					id: "cus_prod_rc_only",
					productId: "rc_only",
					product: rcMain.product,
					customerPrices: createCustomerPricesForProduct({
						prices: rcMain.allPrices,
						customerProductId: "cus_prod_rc_only",
					}),
					customerEntitlements: rcMain.allEntitlements,
					options: rcMain.allOptions,
					status: CusProductStatus.Active,
					subscriptionIds: [],
					processorType: ProcessorType.RevenueCat,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [rcMainCustomerProduct],
					stripeSubscription: undefined,
				});

				const result = buildStripeSubscriptionItemsUpdate({
					ctx,
					billingContext,
					autumnBillingPlan: {
						customerId: "test",
						insertCustomerProducts: [rcMainCustomerProduct],
					} as never,
					finalCustomerProducts: [rcMainCustomerProduct],
				});

				expect(result).toHaveLength(0);
			});
		});
	},
);
