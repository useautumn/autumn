/**
 * Integration tests for multiple discount stacking in update subscription flow.
 *
 * Tests how multiple discounts interact:
 * - Percent-off discounts stack multiplicatively
 * - Amount-off discounts stack additively
 * - Percent-off is always applied before amount-off
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getStripeSubscription,
	createPercentCoupon,
	createAmountCoupon,
	applySubscriptionDiscount,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

// =============================================================================
// MIGRATED TESTS FROM subscription-discounts.test.ts
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("stacking: two percent-off discounts (multiplicative)")}`,
	async () => {
		const customerId = "stack-pct-pct";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// Create two percent coupons: 20% and 10%
		const coupon1 = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		const coupon2 = await createPercentCoupon({
			stripeCli,
			percentOff: 10,
		});

		// Apply both discounts to subscription
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon1.id, coupon2.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge: $100, 20% off = $80, 10% off = $72
		// Total: -$50 + $72 = $22
		const refundAmount = -50;
		const afterFirstDiscount = Math.round(100 * 0.8);
		const discountedCharge = Math.round(afterFirstDiscount * 0.9);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

// =============================================================================
// NEW STACKING TESTS
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("stacking: percent then amount (percent applied first)")}`,
	async () => {
		const customerId = "stack-pct-amt";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// 30% off + $5 off
		const percentCoupon = await createPercentCoupon({
			stripeCli,
			percentOff: 30,
		});

		const amountCoupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500, // $5
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [percentCoupon.id, amountCoupon.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge: $100, 30% off = $70, then $5 off = $65
		// Total: -$50 + $65 = $15
		expect(preview.total).toBe(15);
	},
);

test.concurrent(
	`${chalk.yellowBright("stacking: two amount-off discounts (additive)")}`,
	async () => {
		const customerId = "stack-amt-amt";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// $10 off + $15 off
		const coupon1 = await createAmountCoupon({
			stripeCli,
			amountOffCents: 1000, // $10
		});

		const coupon2 = await createAmountCoupon({
			stripeCli,
			amountOffCents: 1500, // $15
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon1.id, coupon2.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge: $100, $10 off = $90, $15 off = $75
		// Total: -$50 + $75 = $25
		expect(preview.total).toBe(25);
	},
);

test.concurrent(
	`${chalk.yellowBright("stacking: three discounts (two percent + one amount)")}`,
	async () => {
		const customerId = "stack-three";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// 20% + 10% + $5
		const pct1 = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		const pct2 = await createPercentCoupon({
			stripeCli,
			percentOff: 10,
		});

		const amt = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500, // $5
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [pct1.id, pct2.id, amt.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge: $100, 20% off = $80, 10% off = $72, $5 off = $67
		// Total: -$50 + $67 = $17
		expect(preview.total).toBe(17);
	},
);

test.concurrent(
	`${chalk.yellowBright("stacking: order independence (amount listed before percent)")}`,
	async () => {
		const customerId = "stack-order-test";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// Create amount first, then percent (opposite order)
		const amountCoupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 1000, // $10
		});

		const percentCoupon = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		// Apply in "wrong" order - amount first, percent second
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [amountCoupon.id, percentCoupon.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Regardless of order in array, percent is applied first:
		// Charge: $100, 20% off = $80, $10 off = $70
		// Total: -$50 + $70 = $20
		expect(preview.total).toBe(20);
	},
);

test.concurrent(
	`${chalk.yellowBright("stacking: total discount capped at charge amount")}`,
	async () => {
		const customerId = "stack-cap-total";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// 50% off + $30 off (totals more than $50 charge)
		const percentCoupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
		});

		const amountCoupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 3000, // $30
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [percentCoupon.id, amountCoupon.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge: $100, 50% off = $50, $30 off = $20
		// Total: -$50 + $20 = -$30
		expect(preview.total).toBe(-30);
	},
);
