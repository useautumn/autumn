import { expect, test } from "bun:test";
import {
	applyCustomerCoupon,
	applySubscriptionDiscount,
	createPercentCoupon,
	deleteCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 1: upgrade pro -> premium preserves discount identity and duration")}`, async () => {
	const customerId = "imm-switch-discount-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountBefore = subWithDiscount.discounts![0];
	const discountIdBefore =
		typeof discountBefore !== "string" ? discountBefore.id : null;
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const { subscription: subAfterUpgrade } = await getStripeSubscription({
		customerId,
	});
	const subAfter = await stripeCli.subscriptions.retrieve(subAfterUpgrade.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = subAfter.discounts![0];
	const discountIdAfter =
		typeof discountAfter !== "string" ? discountAfter.id : null;
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter.end : null;

	expect(discountIdAfter).toBe(discountIdBefore);

	expect(discountEndAfter).toBe(discountEndBefore);
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 2: discount preserved through multiple upgrades")}`, async () => {
	const customerId = "imm-switch-discount-multi-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const ultra = products.ultra({
		id: "ultra",
		items: [items.monthlyMessages({ includedUsage: 5000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ultra] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 3,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	const discountBefore = subWithDiscount.discounts![0];
	const discountIdBefore =
		typeof discountBefore !== "string" ? discountBefore.id : null;
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
		redirect_mode: "if_required",
	});

	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = subAfterExpanded.discounts![0];
	const discountIdAfter =
		typeof discountAfter !== "string" ? discountAfter.id : null;
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter.end : null;

	expect(discountIdAfter).toBe(discountIdBefore);

	expect(discountEndAfter).toBe(discountEndBefore);
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 3: upgrade carries over discount when coupon is deleted")}`, async () => {
	const customerId = "imm-switch-discount-deleted-coupon";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	await deleteCoupon({ stripeCli, couponId: coupon.id });

	const upgradeParams = {
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	};
	const upgradePreview = await autumnV1.billing.previewAttach(upgradeParams);

	const expectedTotal = new Decimal(50).times(0.8).sub(20).toNumber();
	expect(upgradePreview.total).toEqual(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: expectedTotal,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 4: upgrade carries over customer-level discount when coupon is deleted")}`, async () => {
	const customerId = "imm-switch-discount-deleted-customer-coupon";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applyCustomerCoupon({ stripeCustomerId, couponId: coupon.id });
	await deleteCoupon({ stripeCli, couponId: coupon.id });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const { subscription: subAfterUpgrade } = await getStripeSubscription({
		customerId,
	});
	const subAfter = await stripeCli.subscriptions.retrieve(subAfterUpgrade.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);
});

test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 5: upgrade works with 1-month recurring coupon")}`, async () => {
	const customerId = "imm-switch-discount-one-month-upgrade";

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

	const { stripeCli } = await getStripeSubscription({ customerId });

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	const upgradeParams = {
		customer_id: customerId,
		product_id: premium.id,
		discounts: [
			{
				reward_id: coupon.id,
			},
		],
		redirect_mode: "if_required" as const,
	};

	const preview = await autumnV1.billing.previewAttach(upgradeParams);
	const expectedTotal = new Decimal(50).times(0.8).sub(20).toNumber();
	expect(preview.total).toEqual(expectedTotal);

	await autumnV1.billing.attach(upgradeParams);

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: expectedTotal,
	});

	const { subscription: upgradedSub } = await getStripeSubscription({
		customerId,
	});
	const upgradedSubWithDiscount = await stripeCli.subscriptions.retrieve(
		upgradedSub.id,
		{
			expand: ["discounts.source.coupon"],
		},
	);
	expect(upgradedSubWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = upgradedSubWithDiscount.discounts?.find((discount) => {
		if (typeof discount === "string") return false;

		const discountCoupon = discount.source?.coupon;
		return (
			typeof discountCoupon !== "string" && discountCoupon?.id === coupon.id
		);
	});

	expect(discountAfter).toBeDefined();
	expect(
		typeof discountAfter !== "string" ? discountAfter?.end : null,
	).not.toBeNull();
});
