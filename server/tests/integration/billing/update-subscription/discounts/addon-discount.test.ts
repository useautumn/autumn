/**
 * Integration tests for discounts on add-on products in update subscription flow.
 *
 * Tests how discounts interact with add-on products:
 * - Add-ons can have their own subscription-level discounts
 * - Main product discounts may or may not affect add-ons
 * - Customer-level discounts apply to all subscriptions
 */

import { expect, test } from "bun:test";
import { getCusStripeSubCount } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

const billingUnits = 12;
const pricePerUnit = 10;

test.concurrent(`${chalk.yellowBright("addon: discount on add-on upgrade")}`, async () => {
	const customerId = "addon-discount-upgrade";

	const mainProduct = products.base({
		id: "main",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const addonProduct = products.base({
		id: "addon",
		isAddOn: true,
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainProduct, addonProduct] }),
		],
		actions: [
			s.attach({
				productId: mainProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: addonProduct.id,
				options: [
					{ feature_id: TestFeature.Credits, quantity: 3 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Apply discount to the (shared) subscription
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Preview upgrade on the add-on
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

	// Upgrade generates: refund (-$30 for 3 units) + charge ($80 for 8 units)
	// Discounts only apply to charges, not refunds
	// Charge with 20% off: $80 * 0.8 = $64
	// Total: -$30 + $64 = $34
	const refundAmount = -30;
	const discountedCharge = Math.round(80 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("addon: customer discount applies to add-on")}`, async () => {
	const customerId = "addon-customer-discount";

	const mainProduct = products.base({
		id: "main",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const addonProduct = products.base({
		id: "addon",
		isAddOn: true,
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainProduct, addonProduct] }),
		],
		actions: [
			s.attach({
				productId: mainProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: addonProduct.id,
				options: [
					{ feature_id: TestFeature.Credits, quantity: 3 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	// Apply customer-level discount (applies to all subscriptions)
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: coupon.id,
	});

	// Preview upgrade on the add-on
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

	// Upgrade generates: refund (-$30 for 3 units) + charge ($80 for 8 units)
	// Discounts only apply to charges, not refunds
	// Charge with 30% off: $80 * 0.7 = $56
	// Total: -$30 + $56 = $26
	const refundAmount = -30;
	const discountedCharge = Math.round(80 * 0.7);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("addon: separate subscription with own discount")}`, async () => {
	const customerId = "addon-separate-sub";

	const mainProduct = products.base({
		id: "main",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	// Create add-on with a base price so it creates its own subscription
	const paidAddon = products.base({
		id: "paid-addon",
		isAddOn: true,
		items: [items.monthlyPrice({ price: 15 }), items.monthlyCredits()],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainProduct, paidAddon] }),
		],
		actions: [
			s.attach({
				productId: mainProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: paidAddon.id,
				newBillingSubscription: true,
			}),
		],
	});

	// Verify we have 2 separate subscriptions
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const subCount = getCusStripeSubCount({ fullCus: fullCustomer });
	expect(subCount).toBe(2);

	// Get the add-on's subscription (should be the second one)
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error("Missing Stripe customer ID");
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	// Apply discount only to the add-on subscription
	// Stripe returns subscriptions newest-first, so data[0] is the add-on (created second)
	const addonSub = subscriptions.data[0];

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: addonSub.id,
		couponIds: [coupon.id],
	});

	// Preview on main product should NOT have discount
	const mainPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50 for 5 units) + charge ($100 for 10 units)
	// Main product has no discount applied
	// Total: -$50 + $100 = $50
	expect(mainPreview.total).toBe(50);
});

test.concurrent(`${chalk.yellowBright("addon: base price add-on with discount")}`, async () => {
	const customerId = "addon-base-price";

	const mainProduct = products.base({
		id: "main",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	// Add-on with just a base price
	const basePriceAddon = products.base({
		id: "base-addon",
		isAddOn: true,
		items: [items.monthlyPrice({ price: 20 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainProduct, basePriceAddon] }),
		],
		actions: [
			s.attach({
				productId: mainProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: basePriceAddon.id,
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Apply discount
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 25,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Preview update on main product (add-on base price is unchanged)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50 for 5 units) + charge ($100 for 10 units)
	// Discounts only apply to charges, not refunds
	// Charge with 25% off: $100 * 0.75 = $75
	// Total: -$50 + $75 = $25
	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.75);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("addon: main discount doesn't affect isolated addon")}`, async () => {
	const customerId = "addon-isolation";

	const mainProduct = products.base({
		id: "main",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const addonProduct = products.base({
		id: "addon",
		isAddOn: true,
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainProduct, addonProduct] }),
		],
		actions: [
			s.attach({
				productId: mainProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
			s.attach({
				productId: addonProduct.id,
				options: [
					{ feature_id: TestFeature.Credits, quantity: 3 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Get the Stripe product ID for the main product only
	const mainStripeProductId =
		typeof subscription.items.data[0]?.price?.product === "string"
			? subscription.items.data[0].price.product
			: subscription.items.data[0]?.price?.product?.id;

	if (!mainStripeProductId) {
		throw new Error("Could not find main Stripe product ID");
	}

	// Apply discount restricted to main product only
	const coupon = await stripeCli.coupons.create({
		percent_off: 40,
		duration: "forever",
		applies_to: {
			products: [mainStripeProductId],
		},
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Preview upgrade on addon - should NOT get discount
	const addonPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

	// Addon upgrade: 5 units * $10 = $50, no discount (not in applies_to)
	expect(addonPreview.total).toBe(50);

	// Preview upgrade on main - should get discount
	const mainPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Main upgrade generates: refund (-$50 for 5 units) + charge ($100 for 10 units)
	// Discount only applies to charge: $100 * 0.6 = $60
	// Total: -$50 + $60 = $10
	expect(mainPreview.total).toBe(10);
});
