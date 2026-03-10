import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — Discount Applied to Overage
//
// Product: pro ($20/mo base) + 1 included user seat, $50/seat overage
// on_increase: BillImmediately
// on_decrease: None
//
// A 20% percent-off discount is applied to the subscription.
// When tracking users past the included boundary, the overage invoice
// should reflect the discount.
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

// ═══════════════════════════════════════════════════════════════════
// alloc-disc1: 20% discount applied to overage invoice
//
// Scenario:
// - Attach pro with 1 included seat
// - Apply 20% discount to the subscription
// - Track 3 users (2 overage seats)
//
// Expected:
// - Overage = 2 seats * $50 = $100
// - Discount = 20% off → $80
// - Invoice total = $80
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("alloc-disc1: 20% discount applied to allocated overage invoice")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "alloc-disc1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 0,
		usage: 3,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -2,
		usage: 3,
	});

	const overageAmount = PRICE_PER_SEAT * 2;
	const discountedAmount = overageAmount * 0.8;

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: discountedAmount,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
