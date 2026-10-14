import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const AUTO_TOPUP_WAIT_MS = 20000;
const BURST_SUPPRESSION_TTL_MS = 35000;

const PLAN_PACK_PRICE = 2;
const TOPUP_PACK_PRICE = 10;
const oneOffItem = (price: number) =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price });

test(`${chalk.yellowBright("topup-plan-rank: a subscription plan's price beats a top-up attached later")}`, async () => {
	const plan = products.pro({
		id: "topup-rank-plan",
		items: [oneOffItem(PLAN_PACK_PRICE)],
	});
	const topUp = products.oneOffAddOn({
		id: "topup-rank-addon",
		items: [oneOffItem(TOPUP_PACK_PRICE)],
	});

	const { customerId, autumnV2_3 } = await initScenario({
		customerId: "topup-plan-rank",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [plan, topUp] }),
		],
		actions: [
			s.billing.attach({
				productId: plan.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				timeout: 3000,
			}),
			s.billing.attach({
				productId: topUp.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
			}),
		],
	});

	await autumnV2_3.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
	});
	await timeout(BURST_SUPPRESSION_TTL_MS);

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: new Decimal(100).sub(85).add(100).toNumber(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PLAN_PACK_PRICE,
		latestStatus: "paid",
		latestInvoiceProductId: plan.id,
	});
});
