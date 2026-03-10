/**
 * Scheduled Switch Discount Preview Tests
 *
 * Verifies that next_cycle preview line items and totals include only
 * discounts that should still be active when the scheduled switch takes effect.
 */

import { expect, test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	createPromotionCode,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts-preview 1: active subscription discount applies to next_cycle")}`, async () => {
	const customerId = "sched-switch-disc-preview-active";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(preview.total).toBe(0);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 16,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(true);
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts-preview 2: fresh promo code applies to next_cycle")}`, async () => {
	const customerId = "sched-switch-disc-preview-promo";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const { stripeCli } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "forever",
	});

	const promotionCode = await createPromotionCode({
		stripeCli,
		coupon,
		code: "SCHEDPREVIEW",
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ promotion_code: promotionCode.code! }],
	});

	expect(preview.total).toBe(0);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 16,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(true);
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts-preview 3: fresh once coupon does not affect next_cycle")}`, async () => {
	const customerId = "sched-switch-disc-preview-once";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const { stripeCli } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "once",
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	expect(preview.total).toBe(0);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 20,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(false);
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts-preview 4: fresh 1-month coupon does not affect annual next_cycle")}`, async () => {
	const customerId = "sched-switch-disc-preview-one-month";

	const proAnnual = products.base({
		id: "pro-annual",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.annualPrice({ price: 200 }),
		],
	});

	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [
			items.monthlyMessages({ includedUsage: 1000 }),
			items.annualPrice({ price: 500 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premiumAnnual] }),
		],
		actions: [s.billing.attach({ productId: premiumAnnual.id })],
	});

	const { stripeCli } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		discounts: [{ reward_id: coupon.id }],
	});

	expect(preview.total).toBe(0);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 200,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(false);
});
