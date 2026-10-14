import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { setCustomerOverageAllowed } from "@tests/integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

const AUTO_TOPUP_WAIT_MS = 40000;

const planBalanceOf = ({
	customer,
	planId,
}: {
	customer: ApiCustomerV5;
	planId: string;
}) => {
	const breakdown = customer.balances[TestFeature.Messages].breakdown?.find(
		(item) => item.plan_id === planId,
	);
	expect(breakdown).toBeDefined();
	return breakdown!;
};

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-1: paydown + remainder to prepaid")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb1-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb1-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 0, quantity: 600 }),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1500,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		expect(
			planBalanceOf({ customer: after, planId: baseProd.id }),
		).toMatchObject({ remaining: 0, usage: 1000 });
		expect(
			planBalanceOf({ customer: after, planId: oneOffProd.id }).remaining,
		).toBe(100);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-4: no overage, full remainder to prepaid (backward compat)")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb4-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb4-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb4",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 300, quantity: 600 }),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 800,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 900,
		});
		expect(
			planBalanceOf({ customer: after, planId: baseProd.id }).remaining,
		).toBe(200);
		expect(
			planBalanceOf({ customer: after, planId: oneOffProd.id }).remaining,
		).toBe(700);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 7,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-5: overage exceeds top-up, no remainder to prepaid")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb5-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb5-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb5",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 0, quantity: 600 }),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2000,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 0,
		});
		expect(planBalanceOf({ customer: after, planId: baseProd.id }).usage).toBe(
			1400,
		);
		expect(
			planBalanceOf({ customer: after, planId: oneOffProd.id }).remaining,
		).toBe(0);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});
	},
);
