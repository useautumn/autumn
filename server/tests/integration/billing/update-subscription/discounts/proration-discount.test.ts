import { expect, test } from "bun:test";
import { applyProration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("proration: mid-cycle upgrade with discount")}`, async () => {
	const customerId = "proration-mid-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const customer = await autumnV1.customers.get(customerId);
	const subscription = customer.products?.[0];

	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	const { stripeCli, subscription: stripeSub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: stripeSub.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const baseRefundAmount = 5 * pricePerUnit;
	const baseChargeAmount = 10 * pricePerUnit;

	const proratedRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseRefundAmount,
	});

	const proratedCharge = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseChargeAmount,
	});

	const discountedCharge = new Decimal(proratedCharge).times(0.8).toNumber();
	const expectedAmount = -proratedRefund + discountedCharge;

	expect(preview.total).toBeCloseTo(expectedAmount, 0);
});

test.concurrent(`${chalk.yellowBright("proration: mid-cycle downgrade (refund not discounted)")}`, async () => {
	const customerId = "proration-mid-downgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const customer = await autumnV1.customers.get(customerId);
	const subscription = customer.products?.[0];

	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	const { stripeCli, subscription: stripeSub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: stripeSub.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits }],
	});

	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const baseRefundAmount = 10 * pricePerUnit;
	const baseChargeAmount = 5 * pricePerUnit;

	const proratedRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseRefundAmount,
	});

	const proratedCharge = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseChargeAmount,
	});

	const discountedCharge = new Decimal(proratedCharge).times(0.5).toNumber();
	const expectedAmount = -proratedRefund + discountedCharge;

	expect(preview.total).toBeCloseTo(expectedAmount, 0);
});

test.concurrent(`${chalk.yellowBright("proration: discount on upgrade with proration")}`, async () => {
	const customerId = "proration-upgrade-discount";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get(customerId);
	const subscription = customer.products?.[0];

	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	const testClock = await ctx.stripeCli.testHelpers.testClocks.retrieve(
		testClockId!,
	);
	const frozenTimeMs = testClock.frozen_time * 1000;

	const { stripeCli, subscription: stripeSub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: stripeSub.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const baseRefundAmount = 5 * pricePerUnit;
	const baseChargeAmount = 10 * pricePerUnit;

	const proratedRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseRefundAmount,
	});

	const proratedCharge = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: baseChargeAmount,
	});

	const discountedCharge = new Decimal(proratedCharge).times(0.7).toNumber();
	const expectedAmount = -proratedRefund + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});
