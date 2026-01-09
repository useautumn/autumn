/**
 * Integration tests for discount applies_to restrictions in update subscription flow.
 *
 * Tests the applies_to.products restriction on coupons:
 * - Discounts can be restricted to specific Stripe product IDs
 * - Unrestricted discounts apply to all products
 * - Mixed scenarios with some products matching and some not
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getStripeSubscription,
	applySubscriptionDiscount,
} from "./discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(
	`${chalk.yellowBright("applies-to: unrestricted discount applies to all products")}`,
	async () => {
		const customerId = "applies-unrestricted";

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

		// Create coupon without applies_to (applies to all)
		const coupon = await stripeCli.coupons.create({
			percent_off: 30,
			duration: "forever",
			// No applies_to - should apply to everything
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
		// Charge with 30% off: $100 * 0.7 = $70
		// Total: -$50 + $70 = $20
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.7);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("applies-to: discount restricted to matching product")}`,
	async () => {
		const customerId = "applies-matching";

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

		// Get the actual Stripe product ID from the subscription
		const subscriptionItems = subscription.items.data;
		const stripeProductId =
			typeof subscriptionItems[0]?.price?.product === "string"
				? subscriptionItems[0].price.product
				: subscriptionItems[0]?.price?.product?.id;

		if (!stripeProductId) {
			throw new Error("Could not find Stripe product ID");
		}

		// Create coupon that applies to this specific product
		const coupon = await stripeCli.coupons.create({
			percent_off: 40,
			duration: "forever",
			applies_to: {
				products: [stripeProductId],
			},
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
		// Charge with 40% off: $100 * 0.6 = $60
		// Total: -$50 + $60 = $10
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.6);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("applies-to: discount restricted to non-matching product")}`,
	async () => {
		const customerId = "applies-non-matching";

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

		// Create a different Stripe product for the coupon to apply to
		const otherProduct = await stripeCli.products.create({
			name: `Other Product ${customerId}`,
		});

		// Create coupon that applies to a DIFFERENT product
		const coupon = await stripeCli.coupons.create({
			percent_off: 50,
			duration: "forever",
			applies_to: {
				products: [otherProduct.id],
			},
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
		// Product does NOT match applies_to, so no discount
		// Total: -$50 + $100 = $50
		const refundAmount = -50;
		const chargeAmount = 100;
		const expectedAmount = refundAmount + chargeAmount;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("applies-to: multiple products in restriction list")}`,
	async () => {
		const customerId = "applies-multiple-products";

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

		// Get the actual Stripe product ID
		const subscriptionItems = subscription.items.data;
		const stripeProductId =
			typeof subscriptionItems[0]?.price?.product === "string"
				? subscriptionItems[0].price.product
				: subscriptionItems[0]?.price?.product?.id;

		if (!stripeProductId) {
			throw new Error("Could not find Stripe product ID");
		}

		// Create another product
		const otherProduct = await stripeCli.products.create({
			name: `Other Product ${customerId}`,
		});

		// Create coupon that applies to BOTH products
		const coupon = await stripeCli.coupons.create({
			percent_off: 25,
			duration: "forever",
			applies_to: {
				products: [stripeProductId, otherProduct.id],
			},
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
		// Charge with 25% off: $100 * 0.75 = $75
		// Total: -$50 + $75 = $25
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.75);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("applies-to: mixed discounts (one restricted, one unrestricted)")}`,
	async () => {
		const customerId = "applies-mixed";

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

		// Create a product that won't match
		const otherProduct = await stripeCli.products.create({
			name: `Other Product ${customerId}`,
		});

		// Coupon 1: Unrestricted 10% (applies to all)
		const coupon1 = await stripeCli.coupons.create({
			percent_off: 10,
			duration: "forever",
		});

		// Coupon 2: Restricted 20% (applies to other product, not ours)
		const coupon2 = await stripeCli.coupons.create({
			percent_off: 20,
			duration: "forever",
			applies_to: {
				products: [otherProduct.id],
			},
		});

		// Apply both
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
		// Only the unrestricted 10% coupon applies (20% doesn't match our product)
		// Charge with 10% off: $100 * 0.9 = $90
		// Total: -$50 + $90 = $40
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.9);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);
	},
);
