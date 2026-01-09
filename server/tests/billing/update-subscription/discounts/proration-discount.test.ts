/**
 * Integration tests for discounts with proration in update subscription flow.
 *
 * Tests how discounts interact with mid-cycle changes:
 * - Mid-cycle upgrades should have prorated amounts discounted
 * - Mid-cycle downgrades (refunds) should NOT be discounted
 * - Test clock advancement to verify discount behavior over time
 */

import { expect, test } from "bun:test";
import { applyProration } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getStripeSubscription,
	createPercentCoupon,
	applySubscriptionDiscount,
} from "./discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(
	`${chalk.yellowBright("proration: mid-cycle upgrade with discount")}`,
	async () => {
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
				// Advance 15 days into the billing cycle
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Get billing period from customer's subscription
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

		// Preview upgrade from 5 to 10 units mid-cycle
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (prorated -$50) + charge (prorated $100)
		// Discounts only apply to charges, not refunds
		// Use floored seconds to match Stripe's frozen_time calculation
		const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

		const baseRefundAmount = 5 * pricePerUnit; // $50 for 5 units
		const baseChargeAmount = 10 * pricePerUnit; // $100 for 10 units

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

		// Refund is not discounted, charge gets 20% off
		const discountedCharge = new Decimal(proratedCharge).times(0.8).toNumber();
		const expectedAmount = -proratedRefund + discountedCharge;

		// Use toBeCloseTo due to proration timing precision differences
		expect(preview.total).toBeCloseTo(expectedAmount, 0);
	},
);

test.concurrent(
	`${chalk.yellowBright("proration: mid-cycle downgrade (refund not discounted)")}`,
	async () => {
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
						// Start with 10 units
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
				// Advance 15 days into the billing cycle
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Get billing period from customer's subscription
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

		// Apply a 50% discount
		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: stripeSub.id,
			couponIds: [coupon.id],
		});

		// Preview downgrade from 10 to 5 units mid-cycle
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		// Downgrade generates: refund (prorated -$100 for 10 units) + charge (prorated $50 for 5 units)
		// Discounts only apply to charges, not refunds
		// Use floored seconds to match Stripe's frozen_time calculation
		const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

		const baseRefundAmount = 10 * pricePerUnit; // $100 for old 10 units
		const baseChargeAmount = 5 * pricePerUnit; // $50 for new 5 units

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

		// Refund is not discounted, charge gets 50% off
		const discountedCharge = new Decimal(proratedCharge).times(0.5).toNumber();
		const expectedAmount = -proratedRefund + discountedCharge;

		// Use toBeCloseTo due to proration timing precision differences
		expect(preview.total).toBeCloseTo(expectedAmount, 0);
	},
);

test.concurrent(
	`${chalk.yellowBright("proration: discount on upgrade with proration")}`,
	async () => {
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

		// Get billing period from customer's subscription
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

		// Get frozen time from Stripe test clock (matches what backend uses)
		const testClock = await ctx.stripeCli.testHelpers.testClocks.retrieve(
			testClockId!,
		);
		const frozenTimeMs = testClock.frozen_time * 1000;

		const { stripeCli, subscription: stripeSub } = await getStripeSubscription({
			customerId,
		});

		// Apply discount before upgrade
		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 30,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: stripeSub.id,
			couponIds: [coupon.id],
		});

		// Preview upgrade (subscription just created, so nearly full period remaining)
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (prorated -$50) + charge (prorated $100)
		// Discounts only apply to charges, not refunds
		const baseRefundAmount = 5 * pricePerUnit; // $50 for 5 units
		const baseChargeAmount = 10 * pricePerUnit; // $100 for 10 units

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

		// Refund is not discounted, charge gets 30% off
		const discountedCharge = new Decimal(proratedCharge).times(0.7).toNumber();
		const expectedAmount = -proratedRefund + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);
