/**
 * Entity-level customer product tests for buildStripePhasesUpdate.
 *
 * These cover scenarios where customers have both customer-level and entity-level
 * products, testing transitions, cancellations, and downgrades.
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus, msToSeconds } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { buildStripePhasesUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import {
	createCustomerPricesForProduct,
	createProductWithAllPriceTypes,
	expectPhaseItems,
	getStripePriceIds,
	ONE_MONTH_MS,
} from "../stripeSubscriptionTestHelpers";

// ============ TESTS ============

describe(
	chalk.yellowBright("buildStripePhasesUpdate - Entity Customer Products"),
	() => {
		describe(chalk.cyan("Customer Cancellation with Entity Remaining"), () => {
			test("Entity Pro + Customer Pro → Entity Pro + None (customer canceled)", () => {
				const nowMs = Date.now();
				const customerCancelMs = nowMs + ONE_MONTH_MS;

				const proEntity = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
				});

				const proCustomer = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
				});

				// Entity 1 Pro - stays active
				const entity1ProCustomerProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: proEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: proEntity.allEntitlements,
					options: proEntity.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Customer Pro - cancels at customerCancelMs
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
					startsAt: nowMs,
					endedAt: customerCancelMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [entity1ProCustomerProduct, customerProProduct],
					fullProducts: [proEntity.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [entity1ProCustomerProduct, customerProProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Entity Pro (empty price) + Customer Pro (metered price)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(customerCancelMs));
				// Entity uses empty price, customer uses metered - shared prices are merged
				// Only consumable prices differ (empty vs metered)
				expectPhaseItems(phases[0].items!, [
					...new Set([
						...getStripePriceIds(proEntity, { isEntityLevel: true }),
						...getStripePriceIds(proCustomer, { isEntityLevel: false }),
					]),
				]);

				// Phase 2: Entity Pro only (uses empty price)
				expect(phases[1].start_date).toBe(msToSeconds(customerCancelMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(
					phases[1].items!,
					getStripePriceIds(proEntity, { isEntityLevel: true }),
				);
			});
		});

		describe(chalk.cyan("Customer Downgrade with Entity Remaining"), () => {
			test("Entity Premium + Customer Premium → Entity Premium + Customer Pro (customer downgrade)", () => {
				const nowMs = Date.now();
				const downgradeMs = nowMs + ONE_MONTH_MS;

				const premiumEntity = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity1",
				});

				const premiumCustomer = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_customer",
				});

				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
				});

				// Entity 1 Premium - stays active throughout
				const entity1PremiumCustomerProduct = customerProducts.create({
					id: "cus_prod_premium_entity1",
					productId: "premium",
					product: premiumEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumEntity.allPrices,
						customerProductId: "cus_prod_premium_entity1",
					}),
					customerEntitlements: premiumEntity.allEntitlements,
					options: premiumEntity.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Customer Premium - ends at downgradeMs
				const customerPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_customer",
					productId: "premium",
					product: premiumCustomer.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumCustomer.allPrices,
						customerProductId: "cus_prod_premium_customer",
					}),
					customerEntitlements: premiumCustomer.allEntitlements,
					options: premiumCustomer.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: downgradeMs,
				});

				// Customer Pro - starts at downgradeMs
				const customerProProduct = customerProducts.create({
					id: "cus_prod_pro_customer",
					productId: "pro",
					product: pro.product,
					customerPrices: createCustomerPricesForProduct({
						prices: pro.allPrices,
						customerProductId: "cus_prod_pro_customer",
					}),
					customerEntitlements: pro.allEntitlements,
					options: pro.allOptions,
					status: CusProductStatus.Scheduled,
					startsAt: downgradeMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						entity1PremiumCustomerProduct,
						customerPremiumProduct,
						customerProProduct,
					],
					fullProducts: [premiumEntity.product, pro.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						entity1PremiumCustomerProduct,
						customerPremiumProduct,
						customerProProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Entity Premium (empty) + Customer Premium (metered)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(downgradeMs));
				expectPhaseItems(phases[0].items!, [
					...new Set([
						...getStripePriceIds(premiumEntity, { isEntityLevel: true }),
						...getStripePriceIds(premiumCustomer, { isEntityLevel: false }),
					]),
				]);

				// Phase 2: Entity Premium (empty) + Customer Pro (metered)
				expect(phases[1].start_date).toBe(msToSeconds(downgradeMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...new Set([
						...getStripePriceIds(premiumEntity, { isEntityLevel: true }),
						...getStripePriceIds(pro, { isEntityLevel: false }),
					]),
				]);
			});
		});

		describe(chalk.cyan("Both Entity and Customer Downgrade"), () => {
			test("Entity Premium + Customer Premium → Entity Pro + Customer Pro (both downgrade)", () => {
				const nowMs = Date.now();
				const downgradeMs = nowMs + ONE_MONTH_MS;

				const premiumEntity = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity1",
				});

				const premiumCustomer = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_customer",
				});

				const proEntity = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
				});

				const proCustomer = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
				});

				// Entity Premium - ends at downgradeMs
				const entityPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_entity1",
					productId: "premium",
					product: premiumEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumEntity.allPrices,
						customerProductId: "cus_prod_premium_entity1",
					}),
					customerEntitlements: premiumEntity.allEntitlements,
					options: premiumEntity.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: downgradeMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Customer Premium - ends at downgradeMs
				const customerPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_customer",
					productId: "premium",
					product: premiumCustomer.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumCustomer.allPrices,
						customerProductId: "cus_prod_premium_customer",
					}),
					customerEntitlements: premiumCustomer.allEntitlements,
					options: premiumCustomer.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: downgradeMs,
				});

				// Entity Pro - starts at downgradeMs
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: proEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: proEntity.allEntitlements,
					options: proEntity.allOptions,
					status: CusProductStatus.Scheduled,
					startsAt: downgradeMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Customer Pro - starts at downgradeMs
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
					status: CusProductStatus.Scheduled,
					startsAt: downgradeMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						entityPremiumProduct,
						customerPremiumProduct,
						entityProProduct,
						customerProProduct,
					],
					fullProducts: [premiumEntity.product, proEntity.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						entityPremiumProduct,
						customerPremiumProduct,
						entityProProduct,
						customerProProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Entity Premium (empty) + Customer Premium (metered)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(downgradeMs));
				expectPhaseItems(phases[0].items!, [
					...new Set([
						...getStripePriceIds(premiumEntity, { isEntityLevel: true }),
						...getStripePriceIds(premiumCustomer, { isEntityLevel: false }),
					]),
				]);

				// Phase 2: Entity Pro (empty) + Customer Pro (metered)
				expect(phases[1].start_date).toBe(msToSeconds(downgradeMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...new Set([
						...getStripePriceIds(proEntity, { isEntityLevel: true }),
						...getStripePriceIds(proCustomer, { isEntityLevel: false }),
					]),
				]);
			});
		});

		describe(chalk.cyan("Multiple Entities Downgrade"), () => {
			test("Entity 1 Premium + Entity 2 Premium → Entity 1 Pro + Entity 2 Pro (both downgrade)", () => {
				const nowMs = Date.now();
				const downgradeMs = nowMs + ONE_MONTH_MS;

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity1",
				});

				const pro = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
				});

				// Entity 1 Premium - ends at downgradeMs
				const entity1PremiumProduct = customerProducts.create({
					id: "cus_prod_premium_entity1",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity1",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: downgradeMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity 2 Premium - ends at downgradeMs
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
					startsAt: nowMs,
					endedAt: downgradeMs,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				// Entity 1 Pro - starts at downgradeMs
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
					status: CusProductStatus.Scheduled,
					startsAt: downgradeMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity 2 Pro - starts at downgradeMs
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
					status: CusProductStatus.Scheduled,
					startsAt: downgradeMs,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						entity1PremiumProduct,
						entity2PremiumProduct,
						entity1ProProduct,
						entity2ProProduct,
					],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						entity1PremiumProduct,
						entity2PremiumProduct,
						entity1ProProduct,
						entity2ProProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Entity 1 Premium + Entity 2 Premium (entities use empty price)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(downgradeMs));
				expectPhaseItems(
					phases[0].items!,
					getStripePriceIds(premium, { isEntityLevel: true }),
				);

				// Phase 2: Entity 1 Pro + Entity 2 Pro (entities use empty price)
				expect(phases[1].start_date).toBe(msToSeconds(downgradeMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(
					phases[1].items!,
					getStripePriceIds(pro, { isEntityLevel: true }),
				);
			});
		});

		describe(chalk.cyan("Staggered Entity Transitions"), () => {
			test("Entity 1 Premium cancels before Entity 2 Premium", () => {
				const nowMs = Date.now();
				const entity1CancelMs = nowMs + ONE_MONTH_MS;
				const entity2CancelMs = nowMs + 2 * ONE_MONTH_MS;

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity1",
				});

				// Entity 1 Premium - cancels first
				const entity1PremiumProduct = customerProducts.create({
					id: "cus_prod_premium_entity1",
					productId: "premium",
					product: premium.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premium.allPrices,
						customerProductId: "cus_prod_premium_entity1",
					}),
					customerEntitlements: premium.allEntitlements,
					options: premium.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: entity1CancelMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity 2 Premium - cancels later
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
					startsAt: nowMs,
					endedAt: entity2CancelMs,
					internalEntityId: "internal_entity_2",
					entityId: "entity_2",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [entity1PremiumProduct, entity2PremiumProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [entity1PremiumProduct, entity2PremiumProduct],
				});

				// Should have 3 phases
				expect(phases).toHaveLength(3);

				// Phase 1: Both entities active (entities use empty price)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(entity1CancelMs));
				expectPhaseItems(
					phases[0].items!,
					getStripePriceIds(premium, { isEntityLevel: true }),
				);

				// Phase 2: Only Entity 2 active (entity uses empty price)
				expect(phases[1].start_date).toBe(msToSeconds(entity1CancelMs));
				expect(phases[1].end_date).toBe(msToSeconds(entity2CancelMs));
				expectPhaseItems(
					phases[1].items!,
					getStripePriceIds(premium, { isEntityLevel: true }),
				);

				// Phase 3: Empty (both canceled)
				expect(phases[2].start_date).toBe(msToSeconds(entity2CancelMs));
				expect(phases[2].end_date).toBeUndefined();
				expect(phases[2].items).toHaveLength(0);
			});
		});

		describe(chalk.cyan("Entity Added Mid-Subscription"), () => {
			test("Customer Pro active → Entity Pro added later", () => {
				const nowMs = Date.now();
				const entityStartMs = nowMs + ONE_MONTH_MS;

				const proCustomer = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
				});

				const proEntity = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
				});

				// Customer Pro - active from now
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
					startsAt: nowMs,
				});

				// Entity Pro - scheduled to start later
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: proEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: proEntity.allEntitlements,
					options: proEntity.allOptions,
					status: CusProductStatus.Scheduled,
					startsAt: entityStartMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [customerProProduct, entityProProduct],
					fullProducts: [proCustomer.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [customerProProduct, entityProProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Customer Pro only (metered price)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(entityStartMs));
				expectPhaseItems(
					phases[0].items!,
					getStripePriceIds(proCustomer, { isEntityLevel: false }),
				);

				// Phase 2: Customer Pro (metered) + Entity Pro (empty)
				expect(phases[1].start_date).toBe(msToSeconds(entityStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...new Set([
						...getStripePriceIds(proCustomer, { isEntityLevel: false }),
						...getStripePriceIds(proEntity, { isEntityLevel: true }),
					]),
				]);
			});
		});

		describe(chalk.cyan("Mixed Entity and Customer Transitions"), () => {
			test("Entity downgrades while customer upgrades at same time", () => {
				const nowMs = Date.now();
				const transitionMs = nowMs + ONE_MONTH_MS;

				const premiumEntity = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_entity1",
				});

				const premiumCustomer = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium_customer",
				});

				const proEntity = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_entity1",
				});

				const proCustomer = createProductWithAllPriceTypes({
					productId: "pro",
					productName: "Pro",
					customerProductId: "cus_prod_pro_customer",
				});

				// Entity Premium - ends at transitionMs (downgrade)
				const entityPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_entity1",
					productId: "premium",
					product: premiumEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumEntity.allPrices,
						customerProductId: "cus_prod_premium_entity1",
					}),
					customerEntitlements: premiumEntity.allEntitlements,
					options: premiumEntity.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: transitionMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Entity Pro - starts at transitionMs
				const entityProProduct = customerProducts.create({
					id: "cus_prod_pro_entity1",
					productId: "pro",
					product: proEntity.product,
					customerPrices: createCustomerPricesForProduct({
						prices: proEntity.allPrices,
						customerProductId: "cus_prod_pro_entity1",
					}),
					customerEntitlements: proEntity.allEntitlements,
					options: proEntity.allOptions,
					status: CusProductStatus.Scheduled,
					startsAt: transitionMs,
					internalEntityId: "internal_entity_1",
					entityId: "entity_1",
				});

				// Customer Pro - ends at transitionMs (upgrade)
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
					startsAt: nowMs,
					endedAt: transitionMs,
				});

				// Customer Premium - starts at transitionMs
				const customerPremiumProduct = customerProducts.create({
					id: "cus_prod_premium_customer",
					productId: "premium",
					product: premiumCustomer.product,
					customerPrices: createCustomerPricesForProduct({
						prices: premiumCustomer.allPrices,
						customerProductId: "cus_prod_premium_customer",
					}),
					customerEntitlements: premiumCustomer.allEntitlements,
					options: premiumCustomer.allOptions,
					status: CusProductStatus.Scheduled,
					startsAt: transitionMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						entityPremiumProduct,
						entityProProduct,
						customerProProduct,
						customerPremiumProduct,
					],
					fullProducts: [premiumEntity.product, proEntity.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						entityPremiumProduct,
						entityProProduct,
						customerProProduct,
						customerPremiumProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Entity Premium (empty) + Customer Pro (metered)
				// Different products, so no shared price IDs
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(transitionMs));
				expectPhaseItems(phases[0].items!, [
					...getStripePriceIds(premiumEntity, { isEntityLevel: true }),
					...getStripePriceIds(proCustomer, { isEntityLevel: false }),
				]);

				// Phase 2: Entity Pro (empty) + Customer Premium (metered)
				// Different products, so no shared price IDs
				expect(phases[1].start_date).toBe(msToSeconds(transitionMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...getStripePriceIds(proEntity, { isEntityLevel: true }),
					...getStripePriceIds(premiumCustomer, { isEntityLevel: false }),
				]);
			});
		});
	},
);
