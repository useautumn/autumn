import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("track-consumable-overage-1: consumable, enabled:true, no spend limit, no max purchase — overage uncapped")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-uncap",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 200,
	});
});

test.concurrent(`${chalk.yellowBright("track-consumable-overage-2: consumable, enabled:true, with spend limit — overage capped by spend limit")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-spend",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 130,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 125,
	});
});

test.concurrent(`${chalk.yellowBright("track-consumable-overage-3: consumable, enabled:true, with max purchase — capped by min_balance from max purchase")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-maxpurch",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 50,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-3",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 150,
	});
});

test.concurrent(`${chalk.yellowBright("track-consumable-overage-4: consumable, enabled:false — overage capped at 0")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-disabled",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 130,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 100,
	});
});

test.concurrent(`${chalk.yellowBright("track-consumable-overage-5: consumable, enabled:false, with max purchase — max purchase also blocked")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-dis-maxp",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 50,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 100,
	});
});

test.concurrent(`${chalk.yellowBright("track-consumable-overage-6: consumable, enabled:false after existing overage — no further deduction")}`, async () => {
	const prod = products.base({
		id: "consumable-overage-dis-past",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-consumable-overage-6",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 130,
	});

	let customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 130,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 130,
	});
});
