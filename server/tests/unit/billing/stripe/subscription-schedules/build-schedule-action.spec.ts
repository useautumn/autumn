/**
 * Unit tests for buildStripeSubscriptionScheduleAction.
 *
 * Tests all 4 scenarios:
 * - no_phases: No phases with items
 * - single_indefinite: 1 phase with no end_date (uncancel)
 * - simple_cancel: 1 phase + trailing empty (cancel at end of cycle)
 * - multi_phase: Multiple phases requiring a schedule
 *
 * Each scenario is tested with and without an existing schedule.
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus, msToSeconds } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import type Stripe from "stripe";
import { buildStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeSubscriptionScheduleAction";
import {
	createCustomerPricesForProduct,
	createProductWithAllPriceTypes,
	ONE_MONTH_MS,
} from "../stripeSubscriptionTestHelpers";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const createMockStripeSubscription = (id = "sub_test") =>
	({
		id,
		status: "active",
	}) as unknown as Stripe.Subscription;

const createMockStripeSchedule = (id = "sub_sched_test") =>
	({
		id,
		status: "active",
	}) as unknown as Stripe.SubscriptionSchedule;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe(
	chalk.yellowBright("buildStripeSubscriptionScheduleAction - Scenarios"),
	() => {
		// ═══════════════════════════════════════════════════════════════════════
		// SCENARIO: no_phases
		// ═══════════════════════════════════════════════════════════════════════

		describe(chalk.cyan("Scenario: no_phases"), () => {
			test("no customer products → no action", () => {
				const nowMs = Date.now();
				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					fullProducts: [],
					currentEpochMs: nowMs,
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [],
				});

				expect(result).toEqual({});
			});

			test("no customer products + existing schedule → no action (schedule unrelated)", () => {
				const nowMs = Date.now();
				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [],
					fullProducts: [],
					currentEpochMs: nowMs,
					stripeSubscriptionSchedule: createMockStripeSchedule(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [],
				});

				// No action because no customer products are related to the schedule
				expect(result).toEqual({});
			});
		});

		// ═══════════════════════════════════════════════════════════════════════
		// SCENARIO: single_indefinite (uncancel)
		// ═══════════════════════════════════════════════════════════════════════

		describe(chalk.cyan("Scenario: single_indefinite (uncancel)"), () => {
			test("active product with no end_date, no schedule → no action", () => {
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
					stripeSubscriptionId: "sub_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
					stripeSubscription: createMockStripeSubscription(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct],
				});

				expect(result).toEqual({});
			});

			test("active product with no end_date, has schedule → release", () => {
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
					stripeSubscriptionScheduleId: "sub_sched_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
					stripeSubscriptionSchedule: createMockStripeSchedule(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct],
				});

				expect(result.scheduleAction).toEqual({
					type: "release",
					stripeSubscriptionScheduleId: "sub_sched_test",
				});
				expect(result.subscriptionCancelAt).toBeUndefined();
			});
		});

		// ═══════════════════════════════════════════════════════════════════════
		// SCENARIO: simple_cancel
		// ═══════════════════════════════════════════════════════════════════════

		describe(chalk.cyan("Scenario: simple_cancel"), () => {
			test("product canceling at end of cycle, no schedule → cancelAt only", () => {
				const nowMs = Date.now();
				const cancelAtMs = nowMs + ONE_MONTH_MS;

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
					endedAt: cancelAtMs,
					stripeSubscriptionId: "sub_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
					stripeSubscription: createMockStripeSubscription(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct],
				});

				expect(result.scheduleAction).toBeUndefined();
				expect(result.subscriptionCancelAt).toBe(msToSeconds(cancelAtMs));
			});

			test("product canceling at end of cycle, has schedule → release + cancelAt", () => {
				const nowMs = Date.now();
				const cancelAtMs = nowMs + ONE_MONTH_MS;

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
					endedAt: cancelAtMs,
					stripeSubscriptionScheduleId: "sub_sched_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct],
					fullProducts: [premium.product],
					currentEpochMs: nowMs,
					stripeSubscriptionSchedule: createMockStripeSchedule(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct],
				});

				expect(result.scheduleAction).toEqual({
					type: "release",
					stripeSubscriptionScheduleId: "sub_sched_test",
				});
				expect(result.subscriptionCancelAt).toBe(msToSeconds(cancelAtMs));
			});
		});

		// ═══════════════════════════════════════════════════════════════════════
		// SCENARIO: multi_phase
		// ═══════════════════════════════════════════════════════════════════════

		describe(chalk.cyan("Scenario: multi_phase"), () => {
			test("downgrade (Premium → Pro), no schedule → create", () => {
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
					stripeSubscriptionId: "sub_test",
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
					stripeSubscriptionId: "sub_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
					stripeSubscription: createMockStripeSubscription(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				expect(result.scheduleAction?.type).toBe("create");
				expect(result.scheduleAction?.params?.phases).toHaveLength(2);
				expect(result.scheduleAction?.params?.end_behavior).toBe("release");
				expect(result.subscriptionCancelAt).toBeUndefined();
			});

			test("downgrade (Premium → Pro), has schedule → update", () => {
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
					stripeSubscriptionScheduleId: "sub_sched_test",
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
					stripeSubscriptionScheduleId: "sub_sched_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
					stripeSubscriptionSchedule: createMockStripeSchedule(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				expect(result.scheduleAction?.type).toBe("update");
				expect(result.scheduleAction?.stripeSubscriptionScheduleId).toBe(
					"sub_sched_test",
				);
				expect(result.scheduleAction?.params?.phases).toHaveLength(2);
				expect(result.scheduleAction?.params?.end_behavior).toBe("release");
				expect(result.subscriptionCancelAt).toBeUndefined();
			});

			test("downgrade then cancel (Premium → Pro → cancel), no schedule → create with end_behavior: cancel", () => {
				const nowMs = Date.now();
				const proStartMs = nowMs + ONE_MONTH_MS;
				const cancelAtMs = proStartMs + ONE_MONTH_MS;

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
					endedAt: proStartMs,
					stripeSubscriptionId: "sub_test",
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
					endedAt: cancelAtMs,
					stripeSubscriptionId: "sub_test",
				});

				const ctx = contexts.create({ features: [] });
				const billingContext = contexts.createBilling({
					customerProducts: [premiumCustomerProduct, proCustomerProduct],
					fullProducts: [premium.product, pro.product],
					currentEpochMs: nowMs,
					stripeSubscription: createMockStripeSubscription(),
				});

				const result = buildStripeSubscriptionScheduleAction({
					ctx,
					billingContext,
					finalCustomerProducts: [premiumCustomerProduct, proCustomerProduct],
				});

				expect(result.scheduleAction?.type).toBe("create");
				expect(result.scheduleAction?.params?.phases).toHaveLength(2);
				expect(result.scheduleAction?.params?.end_behavior).toBe("cancel");
			});
		});
	},
);
