/**
 * Immediate Switch Discount Preview Tests
 *
 * Verifies that next_cycle preview line items and totals include only
 * discounts that should still be active at the next renewal.
 */

import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts-preview 1: active subscription discount applies to next_cycle")}`, async () => {
	const customerId = "imm-switch-disc-preview-active";

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
		actions: [s.billing.attach({ productId: pro.id })],
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
		product_id: premium.id,
	});

	expect(preview.total).toBe(20);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 40,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(true);
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts-preview 2: existing discount expiring before next_cycle is excluded")}`, async () => {
	const customerId = "imm-switch-disc-preview-expiring";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
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

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const previewAt = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: advancedTo + ms.days(20),
	});

	const expectedTotal = await calculateProratedDiff({
		customerId,
		advancedTo: previewAt,
		oldAmount: 20,
		newAmount: 40,
	});

	const params = {
		customer_id: customerId,
		product_id: premium.id,
	};

	const preview = await autumnV1.billing.previewAttach(params);

	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 50,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(false);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 50,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts-preview 3: fresh once coupon does not affect next_cycle")}`, async () => {
	const customerId = "imm-switch-disc-preview-once";

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
		actions: [s.billing.attach({ productId: pro.id })],
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
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	expect(preview.total).toBe(20);

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		total: 50,
	})!;

	expect(
		nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
	).toBe(false);
});
