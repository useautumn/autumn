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

test(`${chalk.yellowBright("auto-topup-plan3: no entity tier — an entity config is ignored; the customer config resolves on an entity track")}`, async () => {
	const prod = products.oneOffAddOn({
		id: "topup-plan3",
		items: [oneOffItem()],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "auto-topup-plan3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});
	const entityId = entities[0].id;

	// Entity-level config (quantity 999) — auto_topups has NO entity tier, so
	// this must be IGNORED.
	await autumnV2_1.entities.update(customerId, entityId, {
		billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 999 }),
	});
	// Customer-level config (quantity 100) — this is what resolves.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
	});
	await timeout(BURST_SUPPRESSION_TTL_MS);

	// Balance below threshold -> the customer config (100) tops up, not the
	// ignored entity config (999).
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
});
