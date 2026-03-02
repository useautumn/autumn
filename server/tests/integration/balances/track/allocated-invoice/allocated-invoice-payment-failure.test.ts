import { test } from "bun:test";

import { OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — Payment Failure Tests
//
// Verifies that when a payment fails:
// 1. The track request returns an error
// 2. The invoice is voided
// 3. The balance is unchanged (rollback)
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;

// ═══════════════════════════════════════════════════════════════════
// pay-fail1: BillImmediately payment failure — error + rollback
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("allocated-invoice-pay-fail1: BillImmediately payment failure returns error and rolls back balance")}`, async () => {
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: PRICE_PER_SEAT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "allocated-invoice-pay-fail1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 3,
			});
		},
	});

	// Balance unchanged — still at included amount
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 1,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 2,
		latestStatus: "void",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// pay-fail2: ProrateImmediately payment failure — error + rollback
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("allocated-invoice-pay-fail2: ProrateImmediately payment failure returns error and rolls back balance")}`, async () => {
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: PRICE_PER_SEAT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const pro = products.pro({ id: "pro", items: [userItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "allocated-invoice-pay-fail2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 3,
			});
		},
	});

	await timeout(4000);

	// Balance unchanged — still at included amount
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: 1,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT * 2,
		latestStatus: "void",
	});
});
