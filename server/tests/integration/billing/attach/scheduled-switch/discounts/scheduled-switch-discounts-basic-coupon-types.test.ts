import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { extractCouponId } from "./utils/scheduledSwitchDiscountsBasic";

test.concurrent(
	`${chalk.yellowBright("schedule-discounts 1: 20% discount preserved after scheduling and cycle advance")}`,
	async () => {
		const customerId = "sched-switch-discount-20pct";

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
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subBefore.id,
			couponIds: [coupon.id],
		});

		const subWithDiscount = await stripeCli.subscriptions.retrieve(
			subBefore.id,
			{
				expand: ["discounts.source.coupon"],
			},
		);
		expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

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

		const { subscription: subAfterSchedule } = await getStripeSubscription({
			customerId,
		});
		const subAfterScheduleExpanded = await stripeCli.subscriptions.retrieve(
			subAfterSchedule.id,
			{ expand: ["discounts.source.coupon"] },
		);
		expect(subAfterScheduleExpanded.discounts?.length).toBeGreaterThanOrEqual(
			1,
		);
		expect(extractCouponId(subAfterScheduleExpanded.discounts?.[0])).toBe(
			coupon.id,
		);

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

		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		const { subscription: subAfterCycle } = await getStripeSubscription({
			customerId,
		});
		const subAfterCycleExpanded = await stripeCli.subscriptions.retrieve(
			subAfterCycle.id,
			{ expand: ["discounts.source.coupon"] },
		);

		expect(subAfterCycleExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
		expect(extractCouponId(subAfterCycleExpanded.discounts?.[0])).toBe(
			coupon.id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule-discounts 2: $10 off discount preserved after scheduling downgrade")}`,
	async () => {
		const customerId = "sched-switch-discount-10off";

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

		const { stripeCli, subscription: subBefore } = await getStripeSubscription({
			customerId,
		});

		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 1000,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subBefore.id,
			couponIds: [coupon.id],
		});

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

		const { subscription: subAfter } = await getStripeSubscription({
			customerId,
		});
		const subAfterExpanded = await stripeCli.subscriptions.retrieve(
			subAfter.id,
			{
				expand: ["discounts.source.coupon"],
			},
		);

		expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
		expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
	},
);
