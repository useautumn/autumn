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

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const initialIncreaseCharge = 2 * PRICE_PER_SEAT;

	const proratedCredit = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 2 * PRICE_PER_SEAT,
		newAmount: 1 * PRICE_PER_SEAT,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

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
