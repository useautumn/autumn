/**
 * Plan-tier auto_topups resolution and scope. auto_topups process async via SQS,
 * so each test waits then asserts the topped up balance + the extra paid invoice.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AUTO_TOPUP_WAIT_MS, oneOffItem } from "./utils/autoTopupPlanTier.js";

test(`${chalk.yellowBright("auto-topup-plan1: a PLAN-DEFAULT config fires a top-up when the customer has none")}`, async () => {
	const prod = products.oneOffAddOn({
		id: "topup-plan1",
		items: [oneOffItem()],
		billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-plan1",
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

	// 100 - 85 = 15 (below threshold 20) -> plan top-up of 100 -> 115.
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: new Decimal(100).sub(85).add(100).toNumber(),
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});
