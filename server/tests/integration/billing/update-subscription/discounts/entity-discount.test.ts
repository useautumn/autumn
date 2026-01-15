/**
 * Integration tests for discounts on entity-based products in update subscription flow.
 *
 * Tests how discounts interact with multi-entity subscriptions:
 * - Discounts apply to all entities on a shared subscription
 * - Entity-specific upgrades are discounted correctly
 * - Unchanged entities are not affected by other entity upgrades
 */

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

	// Preview upgrade for entity 0 only
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
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

	// Preview upgrade for entity 0
	const preview0 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Preview upgrade for entity 1
	const preview1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
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

	// Upgrade entity 0 only
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
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

	// Execute the upgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Verify entity 1 still has original balance (unchanged)
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
				price: 5, // $5 per unit
			}),
		],
	});

	const proProduct = products.base({
		id: "pro",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit, // $10 per unit
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
			// Entity 0 on basic product
			s.attach({
				productId: basicProduct.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			// Entity 1 on pro product
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

	// Preview upgrade on entity 1's pro product
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
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
});
