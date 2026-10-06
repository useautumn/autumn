/**
 * Plan-tier auto_topups resolution and scope. auto_topups process async via SQS,
 * so each test waits then asserts the topped up balance + the extra paid invoice.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	AUTO_TOPUP_WAIT_MS,
	BURST_SUPPRESSION_TTL_MS,
	oneOffItem,
} from "./utils/autoTopupPlanTier.js";

test(`${chalk.yellowBright("auto-topup-plan2: a CUSTOMER config overrides the plan default")}`, async () => {
	// Plan default tops up 100.
	const prod = products.oneOffAddOn({
		id: "topup-plan2",
		items: [oneOffItem()],
		billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-plan2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.billing.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Customer overrides: tops up 300 instead of the plan's 100.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 300 }),
	});
	await timeout(BURST_SUPPRESSION_TTL_MS);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	// 100 - 85 + 300 = 315 (customer quantity, not the plan's 100 -> 115).
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: new Decimal(100).sub(85).add(300).toNumber(),
	});
});
