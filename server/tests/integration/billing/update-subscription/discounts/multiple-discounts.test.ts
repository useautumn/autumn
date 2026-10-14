import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("stacking: two percent-off discounts (multiplicative)")}`, async () => {
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const afterFirstDiscount = Math.round(100 * 0.8);
	const discountedCharge = Math.round(afterFirstDiscount * 0.9);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("stacking: percent then amount (percent applied first)")}`, async () => {
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

	const percentCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	const amountCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 500,
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

	expect(preview.total).toBe(15);
});

test.concurrent(`${chalk.yellowBright("stacking: two amount-off discounts (additive)")}`, async () => {
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

	const coupon1 = await createAmountCoupon({
		stripeCli,
		amountOffCents: 1000,
	});

	const coupon2 = await createAmountCoupon({
		stripeCli,
		amountOffCents: 1500,
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

	expect(preview.total).toBe(25);
});

test.concurrent(`${chalk.yellowBright("stacking: three discounts (two percent + one amount)")}`, async () => {
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
		amountOffCents: 500,
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

	expect(preview.total).toBe(17);
});

test.concurrent(`${chalk.yellowBright("stacking: order independence (amount listed before percent)")}`, async () => {
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

	const amountCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 1000,
	});

	const percentCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

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

	expect(preview.total).toBe(20);
});

test.concurrent(`${chalk.yellowBright("stacking: total discount capped at charge amount")}`, async () => {
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

	const percentCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
	});

	const amountCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 3000,
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

	expect(preview.total).toBe(-30);
});
