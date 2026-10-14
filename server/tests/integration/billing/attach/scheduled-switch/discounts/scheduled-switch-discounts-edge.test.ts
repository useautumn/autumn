import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CouponDurationType,
	RewardType,
} from "@autumn/shared";
import {
	applyCustomerCoupon,
	applySubscriptionDiscount,
	createPercentCoupon,
	deleteCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

const extractDiscountId = (discount: unknown): string | null => {
	if (typeof discount === "string") return discount;
	if (discount && typeof discount === "object" && "id" in discount) {
		return (discount as { id: string }).id;
	}
	return null;
};

test.concurrent(`${chalk.yellowBright("discount-edge-cases 1: repeating coupon duration preserved across phase transition")}`, async () => {
	const customerId = "sched-switch-discount-duration";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 1000,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
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
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	const subWithDiscount = await stripeCli.subscriptions.retrieve(subBefore.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const originalDiscount = subWithDiscount.discounts?.[0];
	expect(originalDiscount).toBeDefined();
	const originalDiscountEnd =
		typeof originalDiscount !== "string" ? originalDiscount?.end : null;
	expect(originalDiscountEnd).not.toBeNull();

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
		withPause: true,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	const { subscription: subAfterCycle } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(
		subAfterCycle.id,
		{ expand: ["discounts.source.coupon"] },
	);

	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfterCycle = subAfterExpanded.discounts?.[0];
	const discountEndAfterCycle =
		typeof discountAfterCycle !== "string" ? discountAfterCycle?.end : null;

	expect(discountEndAfterCycle).toBe(originalDiscountEnd);
});

test.concurrent(`${chalk.yellowBright("discount-edge-cases 2: downgrade succeeds when coupon was deleted (rollover scenario)")}`, async () => {
	const customerId = "sched-switch-discount-deleted-coupon";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 1000,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applyCustomerCoupon({
		stripeCustomerId,
		couponId: coupon.id,
	});

	await deleteCoupon({ stripeCli, couponId: coupon.id });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});
});

test.concurrent(`${chalk.yellowBright("discount-edge-cases 3: promo code via checkout preserved during downgrade to free")}`, async () => {
	const customerId = "promo-checkout-to-free";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const promoCode = `PROMO${Date.now()}`;
	const reward = constructCoupon({
		id: "promo-checkout-reward",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
	});

	reward.discount_config!.duration_type = CouponDurationType.Months;
	reward.discount_config!.duration_value = 2;

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [free, pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	await completeStripeCheckoutFormV2({
		url: res.checkout_url,
		promoCode,
	});
	await timeout(10000);

	const subBefore = await getStripeSubscription({
		customerId,
		expand: ["data.discounts"],
	});

	const discountBefore = subBefore.subscription.discounts?.[0];
	expect(discountBefore).toBeDefined();
	const discountIdBefore = extractDiscountId(discountBefore);
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore?.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const subAfter = await getStripeSubscription({
		customerId,
		expand: ["data.discounts"],
	});

	const discountAfter = subAfter.subscription.discounts?.[0];
	expect(discountAfter).toBeDefined();
	const discountIdAfter = extractDiscountId(discountAfter);
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter?.end : null;

	expect(discountIdAfter).toBe(discountIdBefore);

	expect(discountEndAfter).toBe(discountEndBefore);
});

test.concurrent(`${chalk.yellowBright("discount-edge-cases 4: downgrade doesn't preserve discount if start_date > discount end date")}`, async () => {
	const customerId = "sched-switch-discount-edge-4";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		discounts: [
			{
				reward_id: coupon.id,
			},
		],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		canceling: [premium.id],
		scheduled: [pro.id],
	});
});
