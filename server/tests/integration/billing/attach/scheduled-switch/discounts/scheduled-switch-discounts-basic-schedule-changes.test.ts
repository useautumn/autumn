// Schedule discount preservation (Attach V2): coupons on a Stripe subscription survive scheduled
// paid → paid downgrades.

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Premium to Pro (scheduled) to Free (replace) - discount preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Replace scheduled with free - re-schedules
 *
 * Expected Result:
 * - Discount still on subscription after replacing the scheduled downgrade
 *
 * The schedule is released and recreated during replacement. This test verifies
 * that the discount survives the release + recreate cycle.
 */
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

		// Apply 20% discount to the subscription
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

		// Schedule downgrade to pro
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// Verify mid-state
		const customerMid = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerMid,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerMid,
			productId: pro.id,
		});

		// Replace scheduled pro with free
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		// Verify product states after replacement
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

		// Verify discount is still on the subscription after schedule replacement
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple discounts preserved after scheduled downgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with two discounts (20% off + $5 off)
 * - Downgrade to pro ($20/mo) - scheduled
 *
 * Expected Result:
 * - Both discounts still present on subscription after scheduling
 */
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

		// Apply two discounts to the subscription
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

		// Apply both discounts
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subBefore.id,
			couponIds: [percentCoupon.id, amountCoupon.id],
		});

		// Verify both discounts applied
		const subWithDiscounts = await stripeCli.subscriptions.retrieve(
			subBefore.id,
			{ expand: ["discounts.source.coupon"] },
		);
		expect(subWithDiscounts.discounts?.length).toBe(2);

		// Schedule downgrade to pro
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// Verify product states
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer,
			productId: pro.id,
		});

		// Verify BOTH discounts are still on the subscription
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Upgrade from scheduled downgrade - discount preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Upgrade to ultra ($200/mo) - immediate, cancels schedule
 *
 * Expected Result:
 * - Discount should still be on the subscription after upgrade cancels the schedule
 * - Ultra is active, premium and pro are removed
 */
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

		// Apply 20% discount to the subscription
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

		// Verify scheduled state
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

		// Upgrade to ultra (should cancel scheduled downgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: ultra.id,
			redirect_mode: "if_required",
		});

		// Verify ultra is active, premium and pro removed
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [ultra.id],
			notPresent: [premium.id, pro.id],
		});

		// Verify discount is still on the subscription after upgrade
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
