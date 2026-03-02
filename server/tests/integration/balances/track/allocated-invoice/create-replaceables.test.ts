import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — BillImmediately / OnDecrease.None (Replaceables)
//
// Product: 1 included seat, $50/seat
// on_increase: BillImmediately
// on_decrease: None (creates replaceables — balance kept till next cycle)
//
// These tests focus on the REPLACEABLE lifecycle — creation on decrease,
// partial consumption on increase, and cleanup at cycle boundary.
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
// create-rep1: Replaceable creation and charging past included boundary
//
// Flow: +3 → -3 (creates 3 replaceables)
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("create-rep1: replaceable creation and charging past included boundary")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "create-rep1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 3 }),
		],
	});

	// Step 2: Track -3 (creates 3 replaceables, no refund)
	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -3,
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 3,
		usage: 0,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 1,
		usage: 0,
	});

	// No new invoice — OnDecrease.None means no refund
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	// Step 3: Track +1 (consumes 1 replaceable, 1 still left)
	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	expect(trackRes3.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 2,
		usage: 1,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 0,
		usage: 1,
	});

	// Still no new invoice — replaceable consumed, not billed
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// create-rep2: Replaceable creation, partial consumption, and charging past replaceables
// replaceables, then partially consume them
//
// Flow: +3 → -2 (creates 2 reps) → +1 (consumes 1) → +2 (consumes 1 + charges 1)
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("create-rep2: replaceable creation, partial consumption, and charging past replaceables")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "create-rep2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 3 }),
		],
	});

	// Step 2: Track -2 (creates 2 replaceables, no refund)
	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -2,
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 2,
		usage: 1,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 0,
		usage: 1,
	});

	// No new invoice — OnDecrease.None means no refund
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	// Step 3: Track +1 (consumes 1 replaceable, 1 still left)
	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	expect(trackRes3.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 1,
		usage: 2,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -1,
		usage: 2,
	});

	// Still no new invoice — replaceable consumed, not billed
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	// Step 4: Track +2 (consumes 1 remaining rep + charges for 1 new seat)
	const trackRes4: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	expect(trackRes4.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 3,
		current_balance: 0,
		usage: 4,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -3,
		usage: 4,
	});

	// New invoice for 1 seat (the second seat was covered by the replaceable)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PRICE_PER_SEAT * 1,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// create-rep3: Replaceables cleaned up at cycle boundary
//
// Flow: +3 → -3 (creates 2 reps with delete_next_cycle) →
//       advance to next cycle → replaceables deleted, balance resets
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("create-rep3: replaceables with delete_next_cycle are cleaned up at renewal")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, testClockId } = await initScenario({
		customerId: "create-rep3",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 3 }),
		],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 2,
	});

	// Track -3: back to 0 usage, creates 2 replaceables (overage portion)
	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -3,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 2,
		current_balance: 3,
		usage: 0,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 1,
		usage: 0,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After renewal: replaceables with delete_next_cycle should be cleaned
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 1,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
