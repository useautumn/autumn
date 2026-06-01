/**
 * TDD test for auto-preservation of one-off prepaid balances when
 * createSchedule activates a new plan that replaces an existing customer
 * product holding a one-off prepaid customer_entitlement.
 *
 * Contract under test:
 *   When createSchedule's immediate phase replaces an existing main customer
 *   product holding a one-off prepaid customer_entitlement with balance > 0,
 *   the remaining units are preserved as a lifetime cusEnt on the new product.
 *
 * Pre-impl red: balance after the schedule activates reflects only the new
 *   plan (preserved units lost when the outgoing cusProduct is expired).
 * Post-impl green: the createSchedule transition path invokes
 *   cusProductToOneOffPrepaidCarryOvers (or the shared compute helper) and
 *   emits the lifetime cusEnt rows.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// 1. createSchedule with an immediate phase that replaces the current plan
//    preserves one-off prepaid balance.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve createSchedule 1: immediate-phase replacement preserves remaining one-off balance")}`,
	async () => {
		const customerId = "one-off-preserve-create-schedule";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-cs-pres", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-cs-pres",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: Date.now(),
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		await autumnV1.billing.createSchedule(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// premium grants 500; preserved 150 lifetime carryover → 650.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Webhook-driven phase advance preserves the one-off prepaid balance.
//
//    Unlike test 1 (immediate-phase replacement, handled at compute time by
//    computeCreateSchedulePlan), this test exercises the webhook path:
//      handleStripeSubscriptionUpdated → handleSchedulePhaseChanges →
//      expireEndedCustomerProducts.
//    The customer rolls from pro+one-off-prepaid into premium at the phase
//    boundary; Stripe fires the schedule webhook which expires pro AND must
//    persist the one-off remainder as a lifetime cusEnt before the cusProduct
//    is gone.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve createSchedule 2: webhook-driven phase advance preserves one-off prepaid balance as lifetime cusEnt")}`,
	async () => {
		const customerId = "one-off-preserve-schedule-webhook";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro-cs-webhook",
			items: [proOneOff],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-cs-webhook",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const now = advancedTo;
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [
						{
							plan_id: pro.id,
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: 200 },
							],
						},
					],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		// Consume 50 of pro's one-off pack → balance 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Advance past the phase boundary — Stripe fires
		// customer.subscription.updated, the webhook expires pro and the helper
		// inside expireEndedCustomerProducts persists the lifetime carryover.
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: now + ms.days(16),
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// premium grants 500; preserved 150 lifetime carryover → 650.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});
	},
);
