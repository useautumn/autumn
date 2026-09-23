/**
 * `billing.update` removes subscription discounts via `{ action: "remove", reward_id }`.
 *
 * Contract:
 *   1. Removing one of two discounts leaves the other on the Stripe subscription.
 *   2. Removal and addition in the same request produce the combined result.
 *   3. Removing the only discount clears it in Stripe, and renewal bills full price.
 *
 * Red (before):  `action` is stripped as an unknown key, so every entry is added.
 * Green (after): removals drop the matching coupon; additions still apply.
 */

import { test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectSubscriptionDiscountsCorrect } from "@tests/integration/billing/utils/discounts/expectSubscriptionDiscountsCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("remove-discount 1: removing one of two discounts keeps the other")}`,
	async () => {
		const customerId = "remove-disc-one-of-two";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 30 });
		const loyalty = await createPercentCoupon({ stripeCli, percentOff: 10 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id, loyalty.id],
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [{ action: "remove", reward_id: launch.id }],
		});

		await expectSubscriptionDiscountsCorrect({
			customerId,
			couponIds: [loyalty.id],
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("remove-discount 2: remove and add in one request")}`,
	async () => {
		const customerId = "remove-disc-and-add";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 30 });
		const loyalty = await createPercentCoupon({ stripeCli, percentOff: 10 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [
				{ action: "remove", reward_id: launch.id },
				{ action: "add", reward_id: loyalty.id },
			],
		});

		await expectSubscriptionDiscountsCorrect({
			customerId,
			couponIds: [loyalty.id],
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("remove-discount 3: removing the only discount bills full price at renewal")}`,
	async () => {
		const customerId = "remove-disc-only";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_4, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 50 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [{ action: "remove", reward_id: launch.id }],
		});

		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			numberOfHours: 2,
			waitForSeconds: 30,
		});

		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 2,
			latestTotal: 20,
		});
	},
	300_000,
);
