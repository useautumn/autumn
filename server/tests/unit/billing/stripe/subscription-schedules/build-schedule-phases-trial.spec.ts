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
	HALF_MONTH_MS,
	ONE_MONTH_MS,
} from "../stripeSubscriptionTestHelpers";

describe(
	chalk.yellowBright("buildStripePhasesUpdate - Free Trial Scenarios"),
	() => {
		describe(
			chalk.cyan("Single Product with Trial (No Schedule Required)"),
			() => {
				test("Single active product with trial - should have 1 phase (trial does not create transition)", () => {
					const nowMs = Date.now();
					const trialEndsAt = nowMs + HALF_MONTH_MS;

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
						trialEndsAt,
					});

					expect(phases).toHaveLength(1);
					expect(phases[0].start_date).toBe(msToSeconds(nowMs));
					expect(phases[0].end_date).toBeUndefined();
					expect(phases[0].trial_end).toBe(msToSeconds(trialEndsAt));
					expectPhaseItems(phases[0].items!, getStripePriceIds(premium));
				});
			},
		);

		describe(
			chalk.cyan("Product Transition with Trial (Schedule Required)"),
			() => {
				test("Premium → Pro with trial ending mid-Premium phase - trial creates transition point", () => {
					const nowMs = Date.now();
					const trialEndsAt = nowMs + HALF_MONTH_MS;
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
						trialEndsAt,
					});

					expect(phases).toHaveLength(3);

					expect(phases[0].start_date).toBe(msToSeconds(nowMs));
					expect(phases[0].end_date).toBe(msToSeconds(trialEndsAt));
					expect(phases[0].trial_end).toBe(msToSeconds(trialEndsAt));
					expectPhaseItems(phases[0].items!, getStripePriceIds(premium));

					expect(phases[1].start_date).toBe(msToSeconds(trialEndsAt));
					expect(phases[1].end_date).toBe(msToSeconds(proStartMs));
					expect(phases[1].trial_end).toBeUndefined();
					expectPhaseItems(phases[1].items!, getStripePriceIds(premium));

					expect(phases[2].start_date).toBe(msToSeconds(proStartMs));
					expect(phases[2].end_date).toBeUndefined();
					expect(phases[2].trial_end).toBeUndefined();
					expectPhaseItems(phases[2].items!, getStripePriceIds(pro));
				});
			},
		);
	},
);
