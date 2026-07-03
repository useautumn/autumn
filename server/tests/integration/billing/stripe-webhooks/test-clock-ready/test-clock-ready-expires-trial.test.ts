/**
 * TDD test for expiring limited-time trial products from the
 * `test_clock.ready` Stripe webhook handler.
 *
 * Contract under test:
 *   New behavior:
 *     - handleStripeTestClockReady, for each customer under the advanced
 *       clock, expires that customer's active trial customerProducts whose
 *       trial_ends_at is before the test clock's frozen_time — mirroring
 *       productCron's fetchExpiredTrialProducts + processExpiredTrialRow
 *       matching rule (entitlement-only trial with no customerPrices, OR
 *       on_trial_end === "revert").
 *     - Uses frozen_time (not real wall-clock) as "now", since these trials
 *       are simulated forward by the test clock, not real time.
 *     - This happens WITHOUT a manual runProductCron call — driven purely by
 *       the webhook.
 *   Side effects (mirrors the cron exactly):
 *     - Standard trial past its frozen-time trial_ends_at -> Expired, free
 *       default activated (if org has one).
 *     - Revert trial past its frozen-time trial_ends_at -> Expired, previous
 *       paused plan restored to Active.
 *     - A trial NOT yet past frozen-time trial_ends_at is left untouched.
 *
 * Pre-impl red: every assertion below fails because handleStripeTestClockReady
 * only calls resetCustomerEntitlements — it never expires trial products.
 * Post-impl green: all assertions pass once expireTrialProductsForCustomer is
 * wired into the handler using frozen_time as "now".
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
} from "@autumn/shared";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test(
	`${chalk.yellowBright(
		"test-clock-ready 1: standard entitlement-only trial expires from webhook alone, free default activated",
	)}`,
	async () => {
		const customerId = "test-clock-ready-expire-standard";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [freeMessages],
		});

		const trialMessages = items.monthlyMessages({ includedUsage: 500 });
		const trialProduct = products.baseWithTrial({
			id: "trial-product",
			items: [trialMessages],
			trialDays: 3,
			cardRequired: false,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free, trialProduct] })],
			actions: [
				s.billing.attach({ productId: trialProduct.id }),
				s.advanceTestClock({ days: 5, waitForSeconds: 30 }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectProductAttached({
			customer,
			product: trialProduct,
			status: CusProductStatus.Expired,
		});

		expectProductAttached({
			customer,
			product: free,
			status: CusProductStatus.Active,
		});
	},
);

test(
	`${chalk.yellowBright(
		"test-clock-ready 2: revert trial expires from webhook alone, previous paused plan restored",
	)}`,
	async () => {
		const customerId = "test-clock-ready-expire-revert";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV1, autumnV2, testClockId, ctx: scenarioCtx } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, enterprise] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 3,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};
		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		if (!testClockId) {
			throw new Error("Cannot advance test clock: testClock not enabled");
		}
		await advanceTestClock({
			stripeCli: scenarioCtx.stripeCli,
			testClockId,
			numberOfDays: 5,
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectProductAttached({
			customer,
			product: enterprise,
			status: CusProductStatus.Expired,
		});

		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Active,
		});
	},
);

test(
	`${chalk.yellowBright(
		"test-clock-ready 3: trial not yet past trial_ends_at is left untouched by the webhook",
	)}`,
	async () => {
		const customerId = "test-clock-ready-not-yet-expired";

		const free = products.base({
			id: "free",
			isDefault: true,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const trialProduct = products.baseWithTrial({
			id: "trial-product",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			trialDays: 7,
			cardRequired: false,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free, trialProduct] })],
			actions: [
				s.billing.attach({ productId: trialProduct.id }),
				s.advanceTestClock({ days: 1, waitForSeconds: 30 }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectProductAttached({
			customer,
			product: trialProduct,
			status: CusProductStatus.Trialing,
		});
	},
);
