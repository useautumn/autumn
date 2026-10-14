import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

test.concurrent(`${chalk.yellowBright("attach-discount-stacking 1: param discount stacks with existing sub discount")}`, async () => {
	const customerId = "att-disc-stack-exist";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	const paramCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	expect(preview.total).toBe(16);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});
});

test.concurrent(`${chalk.yellowBright("attach-discount-stacking 2: duplicate coupon deduped with existing")}`, async () => {
	const customerId = "att-disc-stack-dedup";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	expect(preview.total).toBe(20);
});

test.concurrent(`${chalk.yellowBright("attach-discount-stacking 3: param amount + existing percent")}`, async () => {
	const customerId = "att-disc-stack-mixed";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	const paramCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 500,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	expect(preview.total).toBe(10);
});

test.concurrent(`${chalk.yellowBright("attach-discount-stacking 4: multiple param discounts + existing")}`, async () => {
	const customerId = "att-disc-stack-multi";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	const pctCoupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
	const amtCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 300,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: pctCoupon.id }, { reward_id: amtCoupon.id }],
	});

	expect(preview.total).toBe(13);
});

test.concurrent(`${chalk.yellowBright("attach-discount-stacking 5: discount on fresh subscription")}`, async () => {
	const customerId = "att-disc-stack-fresh";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});
	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});
});
