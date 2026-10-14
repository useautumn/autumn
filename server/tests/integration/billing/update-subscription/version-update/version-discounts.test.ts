import { expect, test } from "bun:test";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("version-discount: 20% off on price increase")}`, async () => {
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

	const productV2 = products.base({
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
		items: productV2.items,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});
});

test.concurrent(`${chalk.yellowBright("version-discount: 20% off on price decrease")}`, async () => {
	const customerId = "version-disc-pct-dec";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: 20,
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

	const productV2 = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	await autumnV1.products.update(product.id, {
		items: productV2.items,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

	const refundAmount = -100;
	const discountedCharge = Math.round(50 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});
});

test.concurrent(`${chalk.yellowBright("version-discount: $10 off on price increase")}`, async () => {
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

	const coupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 1000,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const productV2 = products.base({
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
		items: productV2.items,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

	const refundAmount = -50;
	const discountedCharge = 100 - 10;
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});
});

test.concurrent(`${chalk.yellowBright("version-discount: 100% off free upgrade")}`, async () => {
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

	const productV2 = products.base({
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
		items: productV2.items,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

	expect(preview.total).toBe(-50);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});
});

test.concurrent(`${chalk.yellowBright("version-discount: multiple discounts stack")}`, async () => {
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

	const productV2 = products.base({
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
		items: productV2.items,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8 * 0.9);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});
});

test.concurrent(`${chalk.yellowBright("version-discount: preserved across v1 to v2 to v3")}`, async () => {
	const customerId = "version-disc-preserve";

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
		percentOff: 25,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 2,
	});

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

	const previewV3 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 3,
	});

	const refundAmount = -(75 * 0.75);
	const discountedCharge = 100 * 0.75;
	const expectedAmount = refundAmount + discountedCharge;

	expect(previewV3.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		version: 3,
	});
});
