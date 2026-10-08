// Allocated Invoice — ProrateNextCycle / ProrateNextCycle: 1 included seat, $50/seat; increases
// and decreases are deferred to the next cycle (no immediate invoice or refund).

import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
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
import {
	BASE_PRICE,
	PRICE_PER_SEAT,
	userItem,
} from "./utils/prorateNextCycle.js";

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
