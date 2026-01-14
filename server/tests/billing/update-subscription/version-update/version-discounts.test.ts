/**
 * Integration tests for discounts during version updates.
 *
 * These tests verify that existing discounts on subscriptions are correctly
 * applied when updating to a new product version.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getStripeSubscription,
	createPercentCoupon,
	createAmountCoupon,
	applySubscriptionDiscount,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION DISCOUNTS: Discount preservation during version updates
// ═══════════════════════════════════════════════════════════════════════════════

// 7.1 Percent discount applied to version upgrade price increase
test.concurrent(
	`${chalk.yellowBright("version-discount: 20% off on price increase")}`,
	async () => {
		const customerId = "version-disc-pct-inc";

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

		// Create v2 with higher price ($20 per unit instead of $10)
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20, // Doubled price
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Preview upgrade to v2
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Current: 5 units * $10 = $50
		// New v2: 5 units * $20 = $100
		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge with 20% off: $100 * 0.8 = $80
		// Total: -$50 + $80 = $30
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.8);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});
	},
);

// 7.2 Percent discount applied to version downgrade (credit)
test.concurrent(
	`${chalk.yellowBright("version-discount: 20% off on price decrease")}`,
	async () => {
		const customerId = "version-disc-pct-dec";

		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20, // Start with higher price
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

		// Create v2 with lower price ($10 per unit instead of $20)
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit, // Half price
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Preview downgrade to v2
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Current: 5 units * $20 = $100
		// New v2: 5 units * $10 = $50
		// Downgrade generates: refund (-$100) + charge ($50)
		// Discounts only apply to charges, not refunds
		// Charge with 20% off: $50 * 0.8 = $40
		// Total: -$100 + $40 = -$60
		const refundAmount = -100;
		const discountedCharge = Math.round(50 * 0.8);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});
	},
);

// 7.3 Amount-off discount applied to version upgrade
test.concurrent(
	`${chalk.yellowBright("version-discount: $10 off on price increase")}`,
	async () => {
		const customerId = "version-disc-amt-inc";

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

		// Create v2 with higher price ($20 per unit instead of $10)
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20, // Doubled price
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Preview upgrade to v2
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Current: 5 units * $10 = $50
		// New v2: 5 units * $20 = $100
		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge with $10 off: $100 - $10 = $90
		// Total: -$50 + $90 = $40
		const refundAmount = -50;
		const discountedCharge = 100 - 10;
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});
	},
);

// 7.4 100% discount on version upgrade (free upgrade)
test.concurrent(
	`${chalk.yellowBright("version-discount: 100% off free upgrade")}`,
	async () => {
		const customerId = "version-disc-100-free";

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

		// Create v2 with higher price ($20 per unit instead of $10)
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20, // Doubled price
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Preview upgrade to v2
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Current: 5 units * $10 = $50
		// New v2: 5 units * $20 = $100
		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge with 100% off: $100 * 0 = $0
		// Total: -$50 + $0 = -$50
		expect(preview.total).toBe(-50);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});
	},
);

// 7.5 Multiple discounts stacking on version update
test.concurrent(
	`${chalk.yellowBright("version-discount: multiple discounts stack")}`,
	async () => {
		const customerId = "version-disc-multi";

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

		// Apply multiple discounts: 20% + 10%
		const coupon1 = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		const coupon2 = await createPercentCoupon({
			stripeCli,
			percentOff: 10,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon1.id, coupon2.id],
		});

		// Create v2 with higher price ($20 per unit instead of $10)
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20, // Doubled price
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Preview upgrade to v2
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Current: 5 units * $10 = $50
		// New v2: 5 units * $20 = $100
		// Upgrade generates: refund (-$50) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge with 20% then 10% off: $100 * 0.8 = $80, then $80 * 0.9 = $72
		// Total: -$50 + $72 = $22
		const refundAmount = -50;
		const discountedCharge = Math.round(100 * 0.8 * 0.9);
		const expectedAmount = refundAmount + discountedCharge;

		expect(preview.total).toBe(expectedAmount);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});
	},
);

// 7.6 Discount preserved across multiple version updates
test.concurrent(
	`${chalk.yellowBright("version-discount: preserved across v1 to v2 to v3")}`,
	async () => {
		const customerId = "version-disc-preserve";

		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit, // $10 per unit
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
			percentOff: 25,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		// Create v2 with $15 per unit
		const productV2 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 15,
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV2.items,
		});

		// Update to v2
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 2,
		});

		// Create v3 with $20 per unit
		const productV3 = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 20,
				}),
			],
		});

		await autumnV1.products.update(product.id, {
			items: productV3.items,
		});

		// Preview upgrade to v3
		const previewV3 = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			version: 3,
		});

		// Current v2: 5 units * $15 = $75
		// New v3: 5 units * $20 = $100
		// Upgrade generates: refund (-$75) + charge ($100)
		// Discounts only apply to charges, not refunds
		// Charge with 25% off: $100 * 0.75 = $75
		// Total: -$75 + $75 = $0
		const refundAmount = -75;
		const discountedCharge = Math.round(100 * 0.75);
		const expectedAmount = refundAmount + discountedCharge;

		expect(previewV3.total).toBe(expectedAmount);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			version: 3,
		});
	},
);
