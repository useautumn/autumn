import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

test.concurrent(`${chalk.yellowBright("attach-discount-double-use 1: billing.attach - duplicate discount on next cycle silently ignored")}`, async () => {
	const customerId = "att-disc-double-use-attach";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const { subscription: subAfterCycle1 } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});
	const discountBefore = subAfterCycle1.discounts.find((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	const discountIdBefore =
		discountBefore && typeof discountBefore !== "string"
			? discountBefore.id
			: null;
	expect(discountIdBefore).not.toBeNull();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(advancedTo), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	const { subscription } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});
	const couponDiscounts = subscription.discounts.filter((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	expect(couponDiscounts).toHaveLength(1);
	const discountIdAfter =
		typeof couponDiscounts[0] !== "string" ? couponDiscounts[0].id : null;
	expect(discountIdAfter).toBe(discountIdBefore);
});

test.concurrent(`${chalk.yellowBright("attach-discount-double-use 2: billing.multiAttach - duplicate discount on next cycle silently ignored")}`, async () => {
	const customerId = "att-disc-double-use-multi";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: pro.id }],
		discounts: [{ reward_id: coupon.id }],
	});

	const { subscription: subAfterCycle1 } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});
	const discountBefore = subAfterCycle1.discounts.find((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	const discountIdBefore =
		discountBefore && typeof discountBefore !== "string"
			? discountBefore.id
			: null;
	expect(discountIdBefore).not.toBeNull();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(advancedTo), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: addon.id }],
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
		notPresent: [free.id],
	});

	const { subscription } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});
	const couponDiscounts = subscription.discounts.filter((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	expect(couponDiscounts).toHaveLength(1);
	const discountIdAfter =
		typeof couponDiscounts[0] !== "string" ? couponDiscounts[0].id : null;
	expect(discountIdAfter).toBe(discountIdBefore);
});

test.concurrent(`${chalk.yellowBright("attach-discount-double-use 3: same coupon on different customer subscription → allowed")}`, async () => {
	const customerId1 = "att-disc-double-use-c1";
	const customerId2 = "att-disc-double-use-c2";

	const free1 = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro1 = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const free2 = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro2 = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId: customerId1,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free1, pro1] }),
		],
		actions: [s.billing.attach({ productId: free1.id })],
	});

	await initScenario({
		customerId: customerId2,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free2, pro2] }),
		],
		actions: [s.billing.attach({ productId: free2.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await autumnV1.billing.attach({
		customer_id: customerId1,
		product_id: pro1.id,
		discounts: [{ reward_id: coupon.id }],
	});

	await autumnV1.billing.attach({
		customer_id: customerId2,
		product_id: pro2.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId2);
	await expectCustomerProducts({
		customer: customer2,
		active: [pro2.id],
		notPresent: [free2.id],
	});
});
