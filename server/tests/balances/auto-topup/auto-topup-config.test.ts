import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	type CustomerBillingControls,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const autoTopupConfig: CustomerBillingControls = {
	auto_topup: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			threshold: 20,
			quantity: 100,
		},
	],
};

test.concurrent(`${chalk.yellowBright("auto-topup config: update customer with billing_controls")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-cfg1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-cfg1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Update customer with billing_controls
	await autumnV2_1.customers.update(customerId, {
		billing_controls: autoTopupConfig,
	});

	// Verify config is persisted in customer response
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.billing_controls).toBeDefined();
	expect(customer.billing_controls?.auto_topup).toHaveLength(1);
	expect(customer.billing_controls?.auto_topup?.[0]).toMatchObject({
		feature_id: TestFeature.Messages,
		enabled: true,
		threshold: 20,
		quantity: 100,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup config: disable auto_topup")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-cfg2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-cfg2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Set enabled config first
	await autumnV2_1.customers.update(customerId, {
		billing_controls: autoTopupConfig,
	});

	// Now disable it
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topup: [
				{
					feature_id: TestFeature.Messages,
					enabled: false,
					threshold: 20,
					quantity: 100,
				},
			],
		},
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.billing_controls?.auto_topup?.[0]?.enabled).toBe(false);
});

test.concurrent(`${chalk.yellowBright("auto-topup config: remove auto_topup with empty array")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-cfg3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-cfg3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Set config
	await autumnV2_1.customers.update(customerId, {
		billing_controls: autoTopupConfig,
	});

	// Remove by setting empty array
	await autumnV2_1.customers.update(customerId, {
		billing_controls: { auto_topup: [] },
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// Either undefined/null or empty array — both are acceptable
	const topups = customer.billing_controls?.auto_topup;
	expect(!topups || topups.length === 0).toBe(true);
});

test.concurrent(`${chalk.yellowBright("auto-topup config: with max_purchases rate limit")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-cfg4",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-cfg4",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topup: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					threshold: 20,
					quantity: 100,
					max_purchases: {
						interval: BillingInterval.Month,
						limit: 5,
					},
				},
			],
		},
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(
		customer.billing_controls?.auto_topup?.[0]?.max_purchases,
	).toMatchObject({
		interval: BillingInterval.Month,
		limit: 5,
	});
});
