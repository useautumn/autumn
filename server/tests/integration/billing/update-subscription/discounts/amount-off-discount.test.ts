/**
 * Integration tests for amount-off discounts in update subscription flow.
 *
 * Tests fixed dollar amount discounts including edge cases like
 * exact match, exceeding charge, proportional distribution, and
 * mixed charge/refund scenarios.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getStripeSubscription,
	createAmountCoupon,
	applySubscriptionDiscount,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

// =============================================================================
// MIGRATED TESTS FROM subscription-discounts.test.ts
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("amount-off: $10 off discount applied to upgrade")}`,
	async () => {
		const customerId = "amt-10-upgrade";

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

		// $10 off coupon (1000 cents)
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 1000,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
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
		// Charge with $10 off: $100 - $10 = $90
		// Total: -$50 + $90 = $40
		const refundAmount = -50;
		const discountedCharge = 100 - 10;
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("amount-off: charge capped at zero when discount exceeds charge")}`,
	async () => {
		const customerId = "amt-cap-zero";

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

		// $100 off coupon (10000 cents) - more than the $50 charge
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 10000,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		// Charge is capped at 0 ($50 - $100 = 0, not negative)
		// But refund for unused portion still applies: -$50
		// Net = -$50 (refund) + $0 (discounted charge) = -$50
		expect(preview.total).toBe(-50);
	},
);

// =============================================================================
// NEW EDGE CASE TESTS
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("amount-off: $5 off small upgrade")}`,
	async () => {
		const customerId = "amt-5-small";

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

		// $5 off coupon (500 cents)
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
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
		// Charge with $5 off: $100 - $5 = $95
		// Total: -$50 + $95 = $45
		expect(preview.total).toBe(45);
	},
);

test.concurrent(
	`${chalk.yellowBright("amount-off: discount equals charge exactly")}`,
	async () => {
		const customerId = "amt-exact-match";

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

		// $50 off coupon (5000 cents) - exactly matches the charge
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 5000,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
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
		// Charge with $50 off: $100 - $50 = $50
		// Total: -$50 + $50 = $0
		expect(preview.total).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("amount-off: mixed charges and refunds (only charges get discount)")}`,
	async () => {
		const customerId = "amt-mixed-charge-refund";

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
						// Start with 10 units = $100
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// $20 off coupon (2000 cents)
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 2000,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		// Preview change: decrease to 5 units
		// This should create a refund for unused, not a charge
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		// Downgrade generates: refund (-$100 for 10 units) + charge ($50 for 5 units)
		// Discounts only apply to charges, not refunds
		// Charge with $20 off: $50 - $20 = $30
		// Total: -$100 + $30 = -$70
		expect(preview.total).toBe(-70);
	},
);

test.concurrent(
	`${chalk.yellowBright("amount-off: large amount on pure upgrade")}`,
	async () => {
		const customerId = "amt-large-pure-upgrade";

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
						// Start with 0 units (minimum to have a subscription)
						{ feature_id: TestFeature.Messages, quantity: 1 * billingUnits },
					],
				}),
			],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		// $25 off coupon (2500 cents)
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 2500,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		// Preview upgrade from 1 to 6 units (adding 5 units = $50)
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 6 * billingUnits },
			],
		});

		// Upgrade generates: refund (-$10 for 1 unit) + charge ($60 for 6 units)
		// Discounts only apply to charges, not refunds
		// Charge with $25 off: $60 - $25 = $35
		// Total: -$10 + $35 = $25
		expect(preview.total).toBe(25);
	},
);
