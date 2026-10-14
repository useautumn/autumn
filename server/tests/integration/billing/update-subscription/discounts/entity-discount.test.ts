import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("entity: discount on single entity upgrade")}`, async () => {
	const customerId = "entity-single-upgrade";

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

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 3 * billingUnits },
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.75);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("entity: both entities share subscription discount")}`, async () => {
	const customerId = "entity-shared-discount";

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

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
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

	const preview0 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const preview1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview0.total).toBe(expectedAmount);
	expect(preview1.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("entity: upgrade one entity while other unchanged")}`, async () => {
	const customerId = "entity-partial-upgrade";

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

	const initialQuantity = 5 * billingUnits;

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.7);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	const feature = entity1.features?.[TestFeature.Messages];

	expect(feature?.balance).toBe(initialQuantity);
});

test.concurrent(`${chalk.yellowBright("entity: discount on entity product switch")}`, async () => {
	const customerId = "entity-product-switch";

	const basicProduct = products.base({
		id: "basic",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: 5,
			}),
		],
	});

	const proProduct = products.base({
		id: "pro",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [basicProduct, proProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: basicProduct.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: proProduct.id,
				entityIndex: 1,
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
		percentOff: 40,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.6);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});
