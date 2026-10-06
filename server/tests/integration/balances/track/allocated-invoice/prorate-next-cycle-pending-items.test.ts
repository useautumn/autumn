// Allocated Invoice — ProrateNextCycle / ProrateNextCycle: 1 included seat, $50/seat; increases
// and decreases are deferred to the next cycle (no immediate invoice or refund).

import { expect, test } from "bun:test";

import type { TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration/calculateProratedDiff.js";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { PRICE_PER_SEAT, userItem } from "./utils/prorateNextCycle.js";

// ═══════════════════════════════════════════════════════════════════
// prorate-nc3: Track +3 then -1 — verify pending invoice items
//
// Checks that each track creates correct prorated pending invoice
// items on the Stripe subscription. A decrease creates two items
// (credit for old allocation + charge for new allocation).
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("prorate-nc3: pending invoice items match prorated amounts after increase and decrease")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, testClockId, advancedTo } =
		await initScenario({
			customerId: "prorate-nc3",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.advanceTestClock({ weeks: 2 }),
			],
		});

	// ─── Step 1: Track +3 (1 included + 2 overage) ───

	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	expect(trackRes1.balance).toMatchObject({
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

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const proratedOverage = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 0,
		newAmount: 2 * PRICE_PER_SEAT,
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const itemsAfterIncrease = await stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
	});

	expect(itemsAfterIncrease.data.length).toBe(1);
	expect(itemsAfterIncrease.data[0].amount).toBe(
		Math.round(proratedOverage * 100),
	);

	// ─── Step 2: Advance 1 week, then track -1 ───

	const advancedTo2 = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		startingFrom: new Date(advancedTo),
		numberOfWeeks: 1,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -1,
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 1,
		current_balance: 0,
		usage: 2,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -1,
		usage: 2,
	});

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const proratedDecrease = await calculateProratedDiff({
		customerId,
		advancedTo: advancedTo2,
		oldAmount: 2 * PRICE_PER_SEAT,
		newAmount: 1 * PRICE_PER_SEAT,
	});

	const itemsAfterDecrease = await stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
	});

	// 3 total: 1 from the increase + 2 from the decrease (credit + charge)
	expect(itemsAfterDecrease.data.length).toBe(3);

	// Newest 2 items are from the decrease (Stripe returns newest first)
	const decreaseItems = itemsAfterDecrease.data.slice(0, 2);
	const hasCredit = decreaseItems.some((item) => item.amount < 0);
	const hasCharge = decreaseItems.some((item) => item.amount > 0);
	expect(hasCredit).toBe(true);
	expect(hasCharge).toBe(true);

	const decreaseNetCents = decreaseItems.reduce(
		(sum, item) => sum + item.amount,
		0,
	);
	expect(decreaseNetCents).toBe(Math.round(proratedDecrease * 100));
});
