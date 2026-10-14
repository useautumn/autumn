import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { extractCouponId } from "./utils/scheduledSwitchDiscountsBasic";

test.concurrent(
	`${chalk.yellowBright("schedule-discounts 3: discount preserved when replacing scheduled downgrade")}`,
	async () => {
		const customerId = "sched-switch-discount-replace";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

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
				s.products({ list: [free, pro, premium] }),
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

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customerMid = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerMid,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerMid,
			productId: pro.id,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerAfterReplace =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterReplace,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerAfterReplace,
			productId: free.id,
		});

		const { subscription: subAfterReplace } = await getStripeSubscription({
			customerId,
		});
		const subAfterExpanded = await stripeCli.subscriptions.retrieve(
			subAfterReplace.id,
			{ expand: ["discounts.source.coupon"] },
		);

		expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
		expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule-discounts 4: multiple discounts preserved after scheduling")}`,
	async () => {
		const customerId = "sched-switch-discount-multi";

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

		const percentCoupon = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		const amountCoupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subBefore.id,
			couponIds: [percentCoupon.id, amountCoupon.id],
		});

		const subWithDiscounts = await stripeCli.subscriptions.retrieve(
			subBefore.id,
			{ expand: ["discounts.source.coupon"] },
		);
		expect(subWithDiscounts.discounts?.length).toBe(2);

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

		expect(subAfterExpanded.discounts?.length).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule-discounts 5: discount preserved after upgrade cancels scheduled downgrade")}`,
	async () => {
		const customerId = "sched-switch-discount-upgrade";

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

		const ultraMessagesItem = items.monthlyMessages({
			includedUsage: 5000,
		});
		const ultra = products.ultra({
			id: "ultra",
			items: [ultraMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, ultra] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: pro.id }),
			],
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

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerBefore,
			productId: pro.id,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: ultra.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [ultra.id],
			notPresent: [premium.id, pro.id],
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
