/**
 * Basic tests for buildStripePhasesUpdate.
 *
 * These cover the fundamental scenarios for building subscription schedule phases.
 */

import { describe, expect, test } from "bun:test";
import { BillingVersion, CusProductStatus, msToSeconds } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { buildStripePhasesUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import {
	createCustomerPricesForProduct,
	createCustomerPricesWithSuffix,
	createProductWithAllPriceTypes,
	expectPhaseItems,
	getStripePriceIds,
	HALF_MONTH_MS,
	ONE_MONTH_MS,
	setPrepaidStripeProductId,
} from "../stripeSubscriptionTestHelpers";

// ============ TESTS ============

describe(
	chalk.yellowBright("buildStripePhasesUpdate - Basic Scenarios"),
	() => {
		describe(chalk.cyan("Single Product - No Transition"), () => {
			test("Single active product with no scheduled changes", () => {
				const nowMs = Date.now();

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
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
					startsAt: nowMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct],
				});

				// Should have 1 phase with no end date (indefinite)
				expect(phases).toHaveLength(1);
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBeUndefined();
				expectPhaseItems(phases[0].items!, getStripePriceIds(premium));
			});
		});

		describe(chalk.cyan("Simple Product Transitions"), () => {
			test("Premium → Pro (downgrade in 1 month)", () => {
				const nowMs = Date.now();
				const proStartMs = nowMs + ONE_MONTH_MS;

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

				// Premium is ACTIVE now, scheduled to end when Pro starts
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
					startsAt: nowMs,
					endedAt: proStartMs,
				});

				// Pro is SCHEDULED to start in the future
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
					status: CusProductStatus.Scheduled,
					startsAt: proStartMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Premium
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(proStartMs));
				expect(phases[0].proration_behavior).toBeUndefined();
				expectPhaseItems(phases[0].items!, getStripePriceIds(premium));

				// Phase 2: Pro
				expect(phases[1].start_date).toBe(msToSeconds(proStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expect(phases[1].proration_behavior).toBe("always_invoice");
				expectPhaseItems(phases[1].items!, getStripePriceIds(pro));
			});

			test("Premium → Pro (downgrade in half a cycle)", () => {
				const nowMs = Date.now();
				const proStartMs = nowMs + HALF_MONTH_MS;

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

				// Premium is ACTIVE now, scheduled to end when Pro starts
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
					startsAt: nowMs,
					endedAt: proStartMs,
				});

				// Pro is SCHEDULED to start in the future
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
					status: CusProductStatus.Scheduled,
					startsAt: proStartMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Premium (half month)
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(proStartMs));
				expectPhaseItems(phases[0].items!, getStripePriceIds(premium));

				// Phase 2: Pro
				expect(phases[1].start_date).toBe(msToSeconds(proStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, getStripePriceIds(pro));
			});
		});

		describe(chalk.cyan("Add-on with Main Product Transitions"), () => {
			test("Premium + Add-on active → Pro + Add-on (main product changes, add-on stays)", () => {
				const nowMs = Date.now();
				const proStartMs = nowMs + HALF_MONTH_MS;

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

				const addOn = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
				});

				// Premium is ACTIVE now, ends at proStartMs
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
					startsAt: nowMs,
					endedAt: proStartMs,
				});

				// Pro is SCHEDULED to start at proStartMs
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
					status: CusProductStatus.Scheduled,
					startsAt: proStartMs,
				});

				// Add-on is ACTIVE throughout (no end date)
				const addOnCustomerProduct = customerProducts.create({
					id: "cus_prod_addon",
					productId: "addon_credits",
					product: addOn.product,
					customerPrices: createCustomerPricesForProduct({
						prices: addOn.allPrices,
						customerProductId: "cus_prod_addon",
					}),
					customerEntitlements: addOn.allEntitlements,
					options: addOn.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						premiumCustomerProduct,
						proCustomerProduct,
						addOnCustomerProduct,
					],
					fullProducts: [premium.product, pro.product, addOn.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						premiumCustomerProduct,
						proCustomerProduct,
						addOnCustomerProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Premium + Add-on
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(proStartMs));
				expectPhaseItems(phases[0].items!, [
					...getStripePriceIds(premium),
					...getStripePriceIds(addOn),
				]);

				// Phase 2: Pro + Add-on
				expect(phases[1].start_date).toBe(msToSeconds(proStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...getStripePriceIds(pro),
					...getStripePriceIds(addOn),
				]);
			});

			test("Premium + Add-on → Pro + Add-on (both scheduled)", () => {
				const nowMs = Date.now();
				const proStartMs = nowMs + ONE_MONTH_MS;

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

				const addOn = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
				});

				// Premium is ACTIVE now, scheduled to end when Pro starts
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
					startsAt: nowMs,
					endedAt: proStartMs,
				});

				// Pro is SCHEDULED to start in the future
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
					status: CusProductStatus.Scheduled,
					startsAt: proStartMs,
				});

				// Add-on is ACTIVE throughout (no end date)
				const addOnCustomerProduct = customerProducts.create({
					id: "cus_prod_addon",
					productId: "addon_credits",
					product: addOn.product,
					customerPrices: createCustomerPricesForProduct({
						prices: addOn.allPrices,
						customerProductId: "cus_prod_addon",
					}),
					customerEntitlements: addOn.allEntitlements,
					options: addOn.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						premiumCustomerProduct,
						proCustomerProduct,
						addOnCustomerProduct,
					],
					fullProducts: [premium.product, pro.product, addOn.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						premiumCustomerProduct,
						proCustomerProduct,
						addOnCustomerProduct,
					],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Premium + Add-on
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(proStartMs));
				expectPhaseItems(phases[0].items!, [
					...getStripePriceIds(premium),
					...getStripePriceIds(addOn),
				]);

				// Phase 2: Pro + Add-on
				expect(phases[1].start_date).toBe(msToSeconds(proStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, [
					...getStripePriceIds(pro),
					...getStripePriceIds(addOn),
				]);
			});
		});

		describe(chalk.cyan("Free Gaps"), () => {
			test("Premium → free gap → Pro uses a zero-dollar placeholder phase", () => {
				const nowMs = Date.now();
				const freeStartMs = nowMs + ONE_MONTH_MS;
				const proStartMs = freeStartMs + ONE_MONTH_MS;

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
					startsAt: nowMs,
					endedAt: freeStartMs,
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
					status: CusProductStatus.Scheduled,
					startsAt: proStartMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				expect(phases).toHaveLength(3);
				expectPhaseItems(phases[0].items!, getStripePriceIds(premium));
				expect(phases[1].start_date).toBe(msToSeconds(freeStartMs));
				expect(phases[1].end_date).toBe(msToSeconds(proStartMs));
				expect(phases[1].items).toEqual([
					expect.objectContaining({
						quantity: 1,
						metadata: { autumn_free_phase_placeholder: "true" },
						price_data: expect.objectContaining({
							product: "stripe_prod_premium",
							unit_amount: 0,
						}),
					}),
				]);
				expectPhaseItems(phases[2].items!, getStripePriceIds(pro));
			});
		});

		describe(chalk.cyan("Product Cancellation"), () => {
			test("Premium → canceled (product ends)", () => {
				const nowMs = Date.now();
				const cancelMs = nowMs + ONE_MONTH_MS;

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				// Premium is ACTIVE now, scheduled to be canceled
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
					startsAt: nowMs,
					endedAt: cancelMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct],
				});

				// Should have 2 phases - Premium then empty
				expect(phases).toHaveLength(2);

				// Phase 1: Premium
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(cancelMs));
				expectPhaseItems(phases[0].items!, getStripePriceIds(premium));

				// Phase 2: Empty (no products)
				expect(phases[1].start_date).toBe(msToSeconds(cancelMs));
				expect(phases[1].end_date).toBeUndefined();
				expect(phases[1].items).toHaveLength(0);
			});

			test("Premium + Add-on → Premium (add-on canceled)", () => {
				const nowMs = Date.now();
				const addOnEndMs = nowMs + ONE_MONTH_MS;

				const premium = createProductWithAllPriceTypes({
					productId: "premium",
					productName: "Premium",
					customerProductId: "cus_prod_premium",
				});

				const addOn = createProductWithAllPriceTypes({
					productId: "addon_credits",
					productName: "Add-on Credits",
					customerProductId: "cus_prod_addon",
					isAddOn: true,
				});

				// Premium is ACTIVE and stays active (no end date)
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
					startsAt: nowMs,
				});

				// Add-on is ACTIVE now but scheduled to end
				const addOnCustomerProduct = customerProducts.create({
					id: "cus_prod_addon",
					productId: "addon_credits",
					product: addOn.product,
					customerPrices: createCustomerPricesForProduct({
						prices: addOn.allPrices,
						customerProductId: "cus_prod_addon",
					}),
					customerEntitlements: addOn.allEntitlements,
					options: addOn.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: addOnEndMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, addOnCustomerProduct],
					fullProducts: [premium.product, addOn.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [premiumCustomerProduct, addOnCustomerProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Premium + Add-on
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(addOnEndMs));
				expectPhaseItems(phases[0].items!, [
					...getStripePriceIds(premium),
					...getStripePriceIds(addOn),
				]);

				// Phase 2: Premium only
				expect(phases[1].start_date).toBe(msToSeconds(addOnEndMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, getStripePriceIds(premium));
			});
		});

		describe(chalk.cyan("Duplicate Inline Prices"), () => {
			test("keeps duplicate prepaid inline items separate across phases", () => {
				const nowMs = Date.now();
				const transientEndsAt = nowMs + ONE_MONTH_MS;
				const productA = setPrepaidStripeProductId(
					createProductWithAllPriceTypes({
						productId: "duplicate_prepaid",
						productName: "Duplicate Prepaid",
						customerProductId: "cus_prod_dup_a",
						prepaidQuantity: 100,
					}),
					"stripe_prod_duplicate_prepaid",
				);
				const productB = setPrepaidStripeProductId(
					createProductWithAllPriceTypes({
						productId: "duplicate_prepaid",
						productName: "Duplicate Prepaid",
						customerProductId: "cus_prod_dup_b",
						prepaidQuantity: 150,
					}),
					"stripe_prod_duplicate_prepaid",
				);

				const customerProductA = customerProducts.create({
					id: "cus_prod_dup_a",
					productId: "duplicate_prepaid",
					product: productA.product,
					customerPrices: createCustomerPricesWithSuffix({
						product: productA,
						customerProductId: "cus_prod_dup_a",
						suffix: "a",
					}),
					customerEntitlements: productA.allEntitlements,
					options: productA.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
				});
				const customerProductB = customerProducts.create({
					id: "cus_prod_dup_b",
					productId: "duplicate_prepaid",
					product: productB.product,
					customerPrices: createCustomerPricesWithSuffix({
						product: productB,
						customerProductId: "cus_prod_dup_b",
						suffix: "b",
					}),
					customerEntitlements: productB.allEntitlements,
					options: productB.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
				});
				const transient = createProductWithAllPriceTypes({
					productId: "transient",
					productName: "Transient",
					customerProductId: "cus_prod_transient",
				});
				const transientCustomerProduct = customerProducts.create({
					id: "cus_prod_transient",
					productId: "transient",
					product: transient.product,
					customerPrices: createCustomerPricesForProduct({
						prices: transient.allPrices,
						customerProductId: "cus_prod_transient",
					}),
					customerEntitlements: transient.allEntitlements,
					options: transient.allOptions,
					status: CusProductStatus.Active,
					startsAt: nowMs,
					endedAt: transientEndsAt,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [
						customerProductA,
						customerProductB,
						transientCustomerProduct,
					],
					fullProducts: [productA.product, transient.product],
					currentEpochMs: nowMs,
					billingVersion: BillingVersion.V2,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [
						customerProductA,
						customerProductB,
						transientCustomerProduct,
					],
				});

				const phase0InlineItems = phases[0].items!.filter(
					(item) => item.price_data,
				);
				const phase1InlineItems = phases[1].items!.filter(
					(item) => item.price_data,
				);

				expect(phases).toHaveLength(2);
				expect(phase0InlineItems).toHaveLength(2);
				expect(phase1InlineItems).toHaveLength(2);
				expect(
					phase0InlineItems.map(
						(item) => item.metadata?.autumn_customer_price_id,
					),
				).toEqual(
					expect.arrayContaining([
						"cus_price_duplicate_prepaid_prepaid_a",
						"cus_price_duplicate_prepaid_prepaid_b",
					]),
				);
				expect(
					phase1InlineItems.map(
						(item) => item.metadata?.autumn_customer_price_id,
					),
				).toEqual(
					expect.arrayContaining([
						"cus_price_duplicate_prepaid_prepaid_a",
						"cus_price_duplicate_prepaid_prepaid_b",
					]),
				);
			});
		});

		describe(chalk.cyan("Upgrade Scenarios"), () => {
			test("Pro → Premium (upgrade in 1 month)", () => {
				const nowMs = Date.now();
				const premiumStartMs = nowMs + ONE_MONTH_MS;

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

				// Pro is ACTIVE now, scheduled to end when Premium starts
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
					startsAt: nowMs,
					endedAt: premiumStartMs,
				});

				// Premium is SCHEDULED to start in the future
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
					status: CusProductStatus.Scheduled,
					startsAt: premiumStartMs,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [proCustomerProduct, premiumCustomerProduct],
					fullProducts: [pro.product, premium.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [proCustomerProduct, premiumCustomerProduct],
				});

				// Should have 2 phases
				expect(phases).toHaveLength(2);

				// Phase 1: Pro
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(msToSeconds(premiumStartMs));
				expectPhaseItems(phases[0].items!, getStripePriceIds(pro));

				// Phase 2: Premium
				expect(phases[1].start_date).toBe(msToSeconds(premiumStartMs));
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, getStripePriceIds(premium));
			});
		});

		describe(chalk.cyan("Millisecond Tolerance"), () => {
			test("Products with sub-second timing differences collapse to same transition", () => {
				const nowMs = Date.now();
				// Truncate to second first, then add sub-second offsets to guarantee same second
				const transitionSecondBase =
					Math.floor((nowMs + ONE_MONTH_MS) / 1000) * 1000;

				// Pro ends 100ms into the second, Premium starts 600ms into the same second
				const proEndsAt = transitionSecondBase + 100;
				const premiumStartsAt = transitionSecondBase + 600;

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

				// Pro is ACTIVE, ends at transitionSecond
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
					startsAt: nowMs,
					endedAt: proEndsAt,
				});

				// Premium is SCHEDULED, starts 500ms after Pro ends
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
					status: CusProductStatus.Scheduled,
					startsAt: premiumStartsAt,
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [proCustomerProduct, premiumCustomerProduct],
					fullProducts: [pro.product, premium.product],
					currentEpochMs: nowMs,
				});

				const phases = buildStripePhasesUpdate({
					ctx,
					billingContext,
					customerProducts: [proCustomerProduct, premiumCustomerProduct],
				});

				// Should have 2 phases (not 3!) because ms differences are truncated to seconds
				expect(phases).toHaveLength(2);

				// Both transition points should collapse to the same second
				const expectedTransitionSeconds = msToSeconds(transitionSecondBase);

				// Phase 1: Pro
				expect(phases[0].start_date).toBe(msToSeconds(nowMs));
				expect(phases[0].end_date).toBe(expectedTransitionSeconds);
				expectPhaseItems(phases[0].items!, getStripePriceIds(pro));

				// Phase 2: Premium
				expect(phases[1].start_date).toBe(expectedTransitionSeconds);
				expect(phases[1].end_date).toBeUndefined();
				expectPhaseItems(phases[1].items!, getStripePriceIds(premium));
			});
		});
	},
);
