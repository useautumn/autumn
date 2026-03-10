import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

test.concurrent(`${chalk.yellowBright("auto-topup trigger 1: when balance is 0 and check is called (when auto top up config is set), trigger fires")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-trigger1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-trigger1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 90,
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 110,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup trigger 2: check with send_event=true does not double-trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-trigger2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-trigger2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// check with send_event=true deducts AND triggers auto top-up check
	// Both the check path (getCheckData) and the track path (deduction)
	// call triggerAutoTopUp — burst suppression NX key should prevent double-fire
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		send_event: true,
		required_balance: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// 100 - 85 = 15, then exactly ONE top-up of 100 → 115
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 115,
	});

	// Exactly 2 invoices: initial attach + one top-up (not two)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup trigger 3: track depletes, then check with send_event=true does not double-trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-trigger3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-trigger3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Track 85 → balance = 15 (below future threshold, but no config yet)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Now set auto top-up config
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// check with send_event=true deducts 2 more → balance = 13
	// Both the check path and the deduction path call triggerAutoTopUp
	// Burst suppression should ensure only ONE top-up fires → balance = 13 + 100 = 113
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		send_event: true,
		required_balance: 2,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 113, // 15 - 2 + 100
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});
