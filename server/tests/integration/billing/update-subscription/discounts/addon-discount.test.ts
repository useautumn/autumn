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
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

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

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: coupon.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

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

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const subCount = getCusStripeSubCount({ fullCus: fullCustomer });
	expect(subCount).toBe(2);

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

	const mainPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

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
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

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

	const mainStripeProductId =
		typeof subscription.items.data[0]?.price?.product === "string"
			? subscription.items.data[0].price.product
			: subscription.items.data[0]?.price?.product?.id;

	if (!mainStripeProductId) {
		throw new Error("Could not find main Stripe product ID");
	}

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

	const addonPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: addonProduct.id,
		options: [{ feature_id: TestFeature.Credits, quantity: 8 * billingUnits }],
	});

	expect(addonPreview.total).toBe(50);

	const mainPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: mainProduct.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(mainPreview.total).toBe(10);
});
