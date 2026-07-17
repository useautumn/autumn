/**
 * Plan-tier auto_topups resolution and scope:
 *   1. plan-default config fires a top-up when the customer has none.
 *   2. a customer config overrides the plan default (customer quantity wins).
 *   3. no entity tier — an entity-level config is ignored; the customer/plan
 *      config resolves even when tracking on an entity.
 *   4. multi-plan collapse is recency-wins (NOT most-restrictive) — the most
 *      recently attached plan's config wins.
 *
 * auto_topups process async via SQS, so each test waits then asserts the topped
 * up balance + the extra paid invoice.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil, timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const AUTO_TOPUP_WAIT_MS = 20000;
// Enabling auto_topup via update fires an on-enabled trigger that sets a 30s
// burst-suppression key; wait past its TTL before the real below-threshold track.
const BURST_SUPPRESSION_TTL_MS = 35000;

const oneOffItem = () =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 });

test(
	`${chalk.yellowBright("auto-topup-plan1: a PLAN-DEFAULT config fires a top-up when the customer has none")}`,
	async () => {
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
		const expectedRemaining = new Decimal(100).sub(85).add(100).toNumber();
		const after = await pollUntil({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			until: (customer) =>
				customer.balances[TestFeature.Messages]?.remaining ===
					expectedRemaining && customer.invoices?.length === 2,
			timeoutMs: AUTO_TOPUP_WAIT_MS,
			intervalMs: 2000,
		});

		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: prod.id,
		});
	},
);

test(
	`${chalk.yellowBright("auto-topup-plan2: a CUSTOMER config overrides the plan default")}`,
	async () => {
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

		// 100 - 85 + 300 = 315 (customer quantity, not the plan's 100 -> 115).
		const expectedRemaining = new Decimal(100).sub(85).add(300).toNumber();
		const after = await pollUntil({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			until: (customer) =>
				customer.balances[TestFeature.Messages]?.remaining === expectedRemaining,
			timeoutMs: AUTO_TOPUP_WAIT_MS,
			intervalMs: 2000,
		});
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
		});
	},
);

test(
	`${chalk.yellowBright("auto-topup-plan3: no entity tier — an entity config is ignored; the customer config resolves on an entity track")}`,
	async () => {
		const prod = products.oneOffAddOn({ id: "topup-plan3", items: [oneOffItem()] });

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

		const expectedRemaining = new Decimal(100).sub(85).add(100).toNumber();
		const after = await pollUntil({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			until: (customer) =>
				customer.balances[TestFeature.Messages]?.remaining === expectedRemaining,
			timeoutMs: AUTO_TOPUP_WAIT_MS,
			intervalMs: 2000,
		});
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
		});
	},
);

test(
	`${chalk.yellowBright("auto-topup-plan4: multi-plan collapse is recency-wins — the most recently attached plan's config wins")}`,
	async () => {
		const basePlan = products.oneOffAddOn({
			id: "topup-plan4-base",
			items: [oneOffItem()],
			billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
		});
		const addOnPlan = products.oneOffAddOn({
			id: "topup-plan4-addon",
			items: [oneOffItem()],
			billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 300 }),
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-plan4",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [basePlan, addOnPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: basePlan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				// Attached LAST -> recency wins: tops up 300.
				s.billing.attach({
					productId: addOnPlan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		// Attaching plans with auto_topup enabled fires on-enabled triggers that
		// set the 30s burst-suppression key; wait it out before the real track.
		await timeout(BURST_SUPPRESSION_TTL_MS);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});

		// 100 - 85 + 300 = 315 (most recent plan's quantity, not the base's 100).
		const expectedRemaining = new Decimal(100).sub(85).add(300).toNumber();
		const after = await pollUntil({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			until: (customer) =>
				customer.balances[TestFeature.Messages]?.remaining === expectedRemaining,
			timeoutMs: AUTO_TOPUP_WAIT_MS,
			intervalMs: 2000,
		});
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
		});
	},
);
