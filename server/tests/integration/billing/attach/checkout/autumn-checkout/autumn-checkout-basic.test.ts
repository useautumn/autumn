import { expect, test } from "bun:test";
import {
	confirmAutumnCheckoutAndGetCustomer,
	expectAutumnCheckoutPreviewError,
	fetchAutumnCheckout,
	previewAutumnCheckout,
} from "@tests/integration/billing/utils/checkout/autumnCheckoutUtils";
import { expectAutumnCheckoutPreview } from "@tests/integration/billing/utils/checkout/expectAutumnCheckout";
import {
	createPercentCoupon,
	createPromotionCode,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { isAutumnCheckoutUrl } from "@tests/integration/billing/utils/isAutumnCheckoutUrl";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

test.concurrent(`${chalk.yellowBright("autumn-checkout: upgrade confirm via fetch")}`, async () => {
	const customerId = "autumn-checkout-upgrade-fetch";

	const starter = products.base({
		id: "starter-autumn-checkout",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	const enterprise = products.base({
		id: "enterprise-autumn-checkout",
		items: [
			items.dashboard(),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 25,
			}),
			items.prepaidUsers({ includedUsage: 5, billingUnits: 1 }),
			items.consumableWords({ includedUsage: 200 }),
			items.allocatedWorkflows({ includedUsage: 3 }),
			items.monthlyPrice({ price: 99 }),
		],
	});

	const options = [
		{ feature_id: TestFeature.Messages, quantity: 500 },
		{ feature_id: TestFeature.Users, quantity: 10 },
	];

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, enterprise] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: enterprise.id,
		redirect_mode: "always",
		options,
	});

	expect(result.payment_url).toBeDefined();
	expect(isAutumnCheckoutUrl(result.payment_url!)).toBe(true);

	const checkoutId = result.payment_url!.split("/c/")[1];
	expect(checkoutId).toBeDefined();

	const checkout = await fetchAutumnCheckout({
		checkoutId,
	});

	expectAutumnCheckoutPreview({
		checkout,
		incomingPlanId: enterprise.id,
		outgoingPlanId: starter.id,
		featureQuantities: options,
	});

	const { customer } = await confirmAutumnCheckoutAndGetCustomer({
		autumnV1,
		checkoutId,
		customerId,
		productId: enterprise.id,
	});

	await expectProductActive({
		customer,
		productId: enterprise.id,
	});
	await expectProductNotPresent({
		customer,
		productId: starter.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 10,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test.concurrent(`${chalk.yellowBright("autumn-checkout: no PM + free product + redirect_mode always")}`, async () => {
	const customerId = "autumn-checkout-no-pm-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free-autumn-checkout",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "always",
	});

	expect(result.payment_url).toBeDefined();
	expect(isAutumnCheckoutUrl(result.payment_url!)).toBe(true);
});

test.concurrent(`${chalk.yellowBright("autumn-checkout: attach applies promo code from checkout")}`, async () => {
	const customerId = "autumn-checkout-attach-promo";
	const starter = products.base({
		id: "starter-autumn-checkout-promo",
		items: [items.monthlyPrice({ price: 19 })],
	});
	const pro = products.base({
		id: "pro-autumn-checkout-promo",
		items: [items.monthlyPrice({ price: 99 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });
	const promo = await createPromotionCode({
		stripeCli,
		coupon,
		code: "ATMNATTACH",
	});
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "always",
	});
	const checkoutId = result.payment_url!.split("/c/")[1];

	const preview = await previewAutumnCheckout({
		checkoutId,
		body: { discounts: [{ promotion_code: promo.code }] },
	});

	expect(
		preview.preview.line_items.some((item) => item.discounts.length > 0),
	).toBe(true);

	await confirmAutumnCheckoutAndGetCustomer({
		autumnV1,
		checkoutId,
		customerId,
		productId: pro.id,
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

test.concurrent(`${chalk.yellowBright("autumn-checkout: invalid promo preview leaves checkout confirmable")}`, async () => {
	const customerId = "autumn-checkout-invalid-promo";
	const starter = products.base({
		id: "starter-autumn-checkout-invalid-promo",
		items: [items.monthlyPrice({ price: 19 })],
	});
	const pro = products.base({
		id: "pro-autumn-checkout-invalid-promo",
		items: [items.monthlyPrice({ price: 99 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "always",
	});
	const checkoutId = result.payment_url!.split("/c/")[1];

	await expectAutumnCheckoutPreviewError({
		checkoutId,
		body: { discounts: [{ promotion_code: "NOT_A_REAL_PROMO_CODE" }] },
	});

	const { customer } = await confirmAutumnCheckoutAndGetCustomer({
		autumnV1,
		checkoutId,
		customerId,
		productId: pro.id,
	});

	await expectProductActive({
		customer,
		productId: pro.id,
	});
});
