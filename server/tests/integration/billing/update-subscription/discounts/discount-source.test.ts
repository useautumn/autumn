import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
	removeSubscriptionDiscount,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("source: subscription discount takes priority over customer discount")}`, async () => {
	const customerId = "src-sub-priority";

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

	const { stripeCli, stripeCustomerId, subscription } =
		await getStripeSubscription({ customerId });

	const subCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	const customerCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: customerCoupon.id,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [subCoupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("source: customer discount used when no subscription discount")}`, async () => {
	const customerId = "src-customer-fallback";

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

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const customerCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: customerCoupon.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.7);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("source: no discount when neither exists")}`, async () => {
	const customerId = "src-no-discount";

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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const chargeAmount = 100;
	const expectedAmount = refundAmount + chargeAmount;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("source: subscription discount removal falls back to customer")}`, async () => {
	const customerId = "src-removal-fallback";

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

	const { stripeCli, stripeCustomerId, subscription } =
		await getStripeSubscription({ customerId });

	const subCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [subCoupon.id],
	});

	const previewWithDiscount = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(previewWithDiscount.total).toBe(40);

	await removeSubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(preview.total).toBe(40);
});

test.concurrent(`${chalk.yellowBright("source: customer discount applies to new product attach")}`, async () => {
	const customerId = "src-new-attach";

	const product1 = products.base({
		id: "prepaid1",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const pricePerUnit2 = 20;
	const product2 = products.base({
		id: "prepaid2",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits,
				price: pricePerUnit2,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product1, product2] }),
		],
		actions: [
			s.attach({
				productId: product1.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const customerCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 25,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: customerCoupon.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: product2.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 4 * billingUnits }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product2.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

	const expectedTotal = 0.75 * -(20 * 4) + 0.75 * (20 * 8);
	expect(preview.total).toBe(expectedTotal);
});
