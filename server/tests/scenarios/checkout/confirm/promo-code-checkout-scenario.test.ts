import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import {
	createPercentCoupon,
	createPromotionCode,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

/**
 * Hosted Checkout Promo Code Scenario
 *
 * Creates a Stripe coupon + promotion code and two hosted checkout URLs:
 * - /c attach checkout
 * - /u update-subscription checkout
 *
 * Run this, copy the logged checkout URL, and enter the logged promo code in the
 * hosted checkout UI.
 */
test(`${chalk.yellowBright("checkout: hosted promo code manual scenario")}`, async () => {
	const customerId = "checkout-promo-code";
	const updateCustomerId = `${customerId}-update`;

	const starter = products.base({
		id: "starter",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});
	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 99 }),
		],
	});
	const prepaid = products.base({
		id: "prepaid",
		items: [
			items.dashboard(),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 25,
			}),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: updateCustomerId, paymentMethod: "success" }]),
			s.products({ list: [starter, pro, prepaid] }),
		],
		actions: [
			s.attach({
				productId: starter.id,
			}),
			s.attach({
				customerId: updateCustomerId,
				productId: prepaid.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });
	const promo = await createPromotionCode({
		stripeCli,
		coupon,
		code: "CHECKOUTPROMO",
	});

	const attachCheckout = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});

	const updateCheckout =
		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: updateCustomerId,
			plan_id: `prepaid_${customerId}`,
			feature_quantities: [
				{
					feature_id: TestFeature.Messages,
					quantity: 300,
					adjustable: true,
				},
			],
			redirect_mode: "always",
		});

	console.log("hosted checkout promo scenario:", {
		promoCode: promo.code,
		couponId: coupon.id,
		attachCheckoutUrl: attachCheckout.payment_url,
		updateCheckoutUrl: updateCheckout.payment_url,
		attachCustomerId: customerId,
		updateCustomerId,
	});
});
