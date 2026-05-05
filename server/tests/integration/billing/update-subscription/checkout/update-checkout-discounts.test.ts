import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import {
	confirmAutumnCheckout,
	previewAutumnCheckout,
} from "@tests/integration/billing/utils/checkout/autumnCheckoutUtils";
import {
	createPercentCoupon,
	createPromotionCode,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

test.concurrent(`${chalk.yellowBright("update-checkout: applies promo code from checkout")}`, async () => {
	const customerId = "update-checkout-promo";
	const pro = products.base({
		id: "pro-update-checkout-promo",
		items: [
			items.monthlyPrice({ price: 99 }),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 25,
			}),
		],
	});
	const featureQuantities = [
		{ feature_id: TestFeature.Messages, quantity: 300 },
	];

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });
	const promo = await createPromotionCode({
		stripeCli,
		coupon,
		code: "ATMNUPDATE",
	});
	const result =
		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "always",
			feature_quantities: featureQuantities,
		});
	const checkoutId = result.payment_url!.split("/u/")[1];

	expect(checkoutId).toBeDefined();

	const preview = await previewAutumnCheckout({
		checkoutId,
		body: {
			feature_quantities: featureQuantities,
			discounts: [{ promotion_code: promo.code }],
		},
	});

	expect(
		preview.preview.line_items.some((item) => item.discounts.length > 0),
	).toBe(true);

	await confirmAutumnCheckout({
		checkoutId,
		customerId,
		productId: pro.id,
		featureQuantities,
		discounts: [{ promotion_code: promo.code }],
	});

	const { subscription } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});

	expect(
		subscription.discounts?.some((discount) => {
			if (typeof discount === "string") return false;
			const sourceCoupon = discount.source?.coupon;
			return typeof sourceCoupon !== "string" && sourceCoupon?.id === coupon.id;
		}),
	).toBe(true);
});
