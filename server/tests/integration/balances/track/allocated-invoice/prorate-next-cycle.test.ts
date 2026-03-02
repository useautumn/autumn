import { expect, test } from "bun:test";

import {
	type ApiCustomerV3,
	OnDecrease,
	OnIncrease,
	type TrackResponseV2,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration/calculateProratedDiff.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — ProrateNextCycle / ProrateNextCycle
//
// Product: 1 included seat, $50/seat
// on_increase: ProrateNextCycle (charge deferred to next cycle)
// on_decrease: ProrateNextCycle (credit deferred to next cycle)
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;
const BASE_PRICE = 20;

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

// ═══════════════════════════════════════════════════════════════════
// prorate-nc1: Track into overage mid-cycle — no immediate invoice
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("prorate-nc1: mid-cycle overage creates no immediate invoice")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, testClockId, advancedTo } =
		await initScenario({
			customerId: "prorate-nc1",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.advanceTestClock({ weeks: 2 }),
			],
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

	// Only the original subscription invoice — no immediate overage invoice
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Calculate prorated overage: 2 extra seats × $50, prorated for remaining period
	const proratedOverage = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 0,
		newAmount: 2 * PRICE_PER_SEAT,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Next cycle invoice: renewal (3 seats × $50) + prorated overage
	const renewalAmount = 2 * PRICE_PER_SEAT + BASE_PRICE;
	const expectedTotal = renewalAmount + proratedOverage;

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// prorate-nc2: Track negative mid-cycle — no immediate refund
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("prorate-nc2: mid-cycle decrease creates no immediate refund")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2, testClockId, advancedTo } =
		await initScenario({
			customerId: "prorate-nc2",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Users, value: 3 }),
				s.advanceTestClock({ weeks: 2 }),
			],
		});

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

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

	// Still only 1 invoice — no immediate refund either
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Initial increase 1→3 happened at cycle start (ratio ≈ 1.0), so charge is full price
	const initialIncreaseCharge = 2 * PRICE_PER_SEAT;

	// Decrease 3→2 happened at advancedTo (2 weeks in), prorated for remaining period
	const proratedCredit = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 2 * PRICE_PER_SEAT,
		newAmount: 1 * PRICE_PER_SEAT,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Next cycle invoice: renewal (2 seats × $50) + initial increase charge + prorated credit
	const renewalAmount = 1 * PRICE_PER_SEAT + BASE_PRICE;
	const expectedTotal = renewalAmount + initialIncreaseCharge + proratedCredit;

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
