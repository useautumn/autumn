/**
 * A customer-level auto top-up must charge the price on the subscription plan
 * the customer is on, not a standalone top-up product bought afterwards.
 *
 * Reported shape: a customer on a tiered plan buys a manual top-up priced at a
 * higher flat rate. The top-up is attached later, so recency alone made it the
 * charge source and the refill billed at the top-up's rate.
 *
 * Red (before):  the refill bills the add-on's $10/pack, latest invoice on the add-on.
 * Green (after): the refill bills the plan's $2/pack, latest invoice on the plan.
 */

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

// One pack = 100 units, so a 100-credit refill bills exactly one pack price —
// the discriminator between the plan's rate and the top-up's rate.
const PLAN_PACK_PRICE = 2;
const TOPUP_PACK_PRICE = 10;
const oneOffItem = (price: number) =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price });

test(`${chalk.yellowBright("topup-plan-rank: a subscription plan's price beats a top-up attached later")}`, async () => {
	// products.pro() is a $20/mo subscription — it carries a recurring price.
	const plan = products.pro({
		id: "topup-rank-plan",
		items: [oneOffItem(PLAN_PACK_PRICE)],
	});
	// A standalone top-up product, attached AFTER the plan.
	const topUp = products.oneOffAddOn({
		id: "topup-rank-addon",
		items: [oneOffItem(TOPUP_PACK_PRICE)],
	});

	const { customerId, autumnV2_3 } = await initScenario({
		customerId: "topup-plan-rank",
		setup: [
			// No test clock: a frozen clock stamps both attaches with the same
			// created_at, and the add-on must be genuinely newer for this to
			// reproduce the reported shape.
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [plan, topUp] }),
		],
		actions: [
			// `timeout` separates the attaches in wall-clock time so the add-on's
			// created_at is genuinely later — the same as a customer buying a
			// top-up after subscribing.
			s.billing.attach({
				productId: plan.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				timeout: 3000,
			}),
			// Bought later — under the old rule this became the charge source.
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

	// 100 - 85 = 15, below the threshold of 20 -> refill of 100 fires.
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

	// The plan's rate, billed against the plan — not the add-on's $10.
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PLAN_PACK_PRICE,
		latestStatus: "paid",
		latestInvoiceProductId: plan.id,
	});
});
