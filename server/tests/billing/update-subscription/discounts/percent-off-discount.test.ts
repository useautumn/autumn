/**
 * Integration tests for percent-off discounts in update subscription flow.
 *
 * Tests various percent-off discount scenarios including edge cases
 * like minimum (1%), maximum (99%), 100% (free), and duration variants.
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
	applySubscriptionDiscount,
} from "./discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

// =============================================================================
// MIGRATED TESTS FROM subscription-discounts.test.ts
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("percent-off: 20% discount applied to upgrade")}`,
	async () => {
		const customerId = "pct-20-upgrade";

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

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
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
		// Charge with 20% off: $100 * 0.8 = $80
		// Total: -$50 + $80 = $30
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.8);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("percent-off: 50% discount applied to upgrade")}`,
	async () => {
		const customerId = "pct-50-upgrade";

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

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
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
		// Charge with 50% off: $100 * 0.5 = $50
		// Total: -$50 + $50 = $0
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.5);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("percent-off: 100% discount (free upgrade)")}`,
	async () => {
		const customerId = "pct-100-free";

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

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 100,
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
		// Charge with 100% off: $100 * 0 = $0
		// Total: -$50 + $0 = -$50
		expect(preview.total).toBe(-50);
	},
);

test.concurrent(
	`${chalk.yellowBright("percent-off: promotion code applied to subscription")}`,
	async () => {
		const customerId = "pct-promo-code";

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

		// Create a coupon and promotion code
		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 25,
		});

		const promotionCode = await stripeCli.promotionCodes.create({
			promotion: {
				type: "coupon",
				coupon: coupon.id,
			},
			code: `SAVE25-${customerId}-${Date.now()}`,
		});

		// Apply via promotion code
		await stripeCli.subscriptions.update(subscription.id, {
			discounts: [{ promotion_code: promotionCode.id }],
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
		// Charge with 25% off: $100 * 0.75 = $75
		// Total: -$50 + $75 = $25
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.75);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

// =============================================================================
// NEW EDGE CASE TESTS
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("percent-off: 1% discount (minimum)")}`,
	async () => {
		const customerId = "pct-1-minimum";

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

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 1,
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
		// Charge with 1% off: $100 * 0.99 = $99
		// Total: -$50 + $99 = $49
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.99);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("percent-off: 99% discount (near-free)")}`,
	async () => {
		const customerId = "pct-99-near-free";

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

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 99,
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
		// Charge with 99% off: $100 * 0.01 = $1
		// Total: -$50 + $1 = -$49
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.01);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("percent-off: discount on quantity decrease (refund not discounted)")}`,
	async () => {
		const customerId = "pct-decrease-refund";

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
						// Start with 10 units
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		// Preview decrease from 10 to 5 units (removing 5 units)
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		// Downgrade generates: refund (-$100 for 10 units) + charge ($50 for 5 units)
		// Discounts only apply to charges, not refunds
		// Charge with 50% off: $50 * 0.5 = $25
		// Total: -$100 + $25 = -$75
		expect(preview.total).toBe(-75);
	},
);
