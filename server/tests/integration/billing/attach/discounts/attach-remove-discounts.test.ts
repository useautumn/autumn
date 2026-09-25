/**
 * `billing.attach` removes existing subscription discounts via `remove_discounts: [{ reward_id }]`.
 *
 * Contract:
 *   1. Upgrading onto a discounted subscription drops the removed coupon and keeps the rest.
 *   2. An add-on merging into a discounted subscription drops the removed coupon.
 *   3. Adding and removing the same reward in one request is rejected.
 *   4. Removing discounts with no_billing_changes is rejected, since no Stripe write happens.
 *
 * Red (before):  `remove_discounts` is stripped as an unknown key, so the coupon carries over.
 * Green (after): removals drop the matching coupon from the subscription the plan lands on.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectSubscriptionDiscountsCorrect } from "@tests/integration/billing/utils/discounts/expectSubscriptionDiscountsCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach-remove-discount 1: upgrade drops the removed coupon and keeps the other")}`,
	async () => {
		const customerId = "att-remove-disc-upgrade";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
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

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			remove_discounts: [{ reward_id: launch.id }],
		});

		await expectSubscriptionDiscountsCorrect({
			customerId,
			couponIds: [loyalty.id],
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("attach-remove-discount 2: add-on merging into the subscription drops the removed coupon")}`,
	async () => {
		const customerId = "att-remove-disc-addon";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 30 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: addon.id,
			remove_discounts: [{ reward_id: launch.id }],
		});

		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("attach-remove-discount 3: adding and removing the same reward is rejected")}`,
	async () => {
		const customerId = "att-remove-disc-same-reward";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli } = await getStripeSubscription({ customerId });
		const launch = await createPercentCoupon({ stripeCli, percentOff: 30 });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: async () => {
				await autumnV2_4.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					discounts: [{ reward_id: launch.id }],
					remove_discounts: [{ reward_id: launch.id }],
				});
			},
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("attach-remove-discount 4: removing discounts with no_billing_changes is rejected")}`,
	async () => {
		const customerId = "att-remove-disc-no-billing";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 30 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: async () => {
				await autumnV2_4.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					no_billing_changes: true,
					remove_discounts: [{ reward_id: launch.id }],
				});
			},
		});

		await expectSubscriptionDiscountsCorrect({
			customerId,
			couponIds: [launch.id],
		});
	},
	300_000,
);
