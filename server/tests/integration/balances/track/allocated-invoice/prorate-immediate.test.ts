import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateProration } from "@tests/integration/billing/utils/proration/calculateProration.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — ProrateImmediately / Prorate
//
// Product: 1 included seat, $50/seat
// on_increase: ProrateImmediately (prorated charge for remaining period)
// on_decrease: Prorate (prorated refund for remaining period)
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

// ═══════════════════════════════════════════════════════════════════
// prorate-imm1: Mid-cycle track charges prorated amount
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("prorate-imm1: mid-cycle track charges prorated amount")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId: "prorate-imm1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			// s.advanceTestClock({ days: 15 }),
		],
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	expect(trackRes.balance).toMatchObject({
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

	const expectedProrated = await calculateProration({
		customerId,
		advancedTo,
		amount: PRICE_PER_SEAT,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedProrated,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// prorate-imm2: Mid-cycle track negative issues prorated refund
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("prorate-imm2: mid-cycle track negative issues prorated refund")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId: "prorate-imm2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 3 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 2,
		latestStatus: "paid",
	});

	// Track -1 mid-cycle (from 3 to 2 usage)
	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -1,
	});

	expect(trackRes.balance).toMatchObject({
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

	const expectedRefund = await calculateProration({
		customerId,
		advancedTo,
		amount: PRICE_PER_SEAT,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: -expectedRefund,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
