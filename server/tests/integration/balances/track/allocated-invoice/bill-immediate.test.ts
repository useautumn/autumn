import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — BillImmediately / OnDecrease.None (Charging)
//
// Product: 1 included seat, $50/seat
// on_increase: BillImmediately (full amount, no proration)
// on_decrease: None (creates replaceables, no refund)
//
// These tests focus on CHARGING behavior — invoices created, amounts
// correct. See create-replaceables.test.ts for replaceable lifecycle.
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
// bill-imm1: Track within included usage — no invoice created
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("bill-imm1: track within included usage creates no invoice")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "bill-imm1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 0,
		current_balance: 0,
		usage: 1,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 0,
		usage: 1,
	});

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// bill-imm2: Track past included boundary — invoice for overage only
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("bill-imm2: track past included boundary creates invoice for overage")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "bill-imm2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
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

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 1,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// bill-imm3: Track additional overage — invoice for each increment
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("bill-imm3: additional overage creates correct invoice")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "bill-imm3",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 2 }),
		],
	});

	// Step 1: Track +1 (1 more overage)
	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
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

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PRICE_PER_SEAT,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// bill-imm4: Mid-cycle track charges FULL amount (no proration)
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("bill-imm4: mid-cycle track charges full amount (no proration)")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "bill-imm4",
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

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 1,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
