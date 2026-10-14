import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const INCLUDED_USAGE = 100;
const BASE_PRICE = 10;
const TIERS = [
	{ to: 500 as const, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("oneoff-prepaid-tiers: customer-level tiered one-off")}`, async () => {
	const customerId = "oneoff-tiers-customer";
	const quantity = 800;

	const expectedPrepaidCost = 5 * 10 + 2 * 5;
	const expectedTotal = BASE_PRICE + expectedPrepaidCost;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const oneOff = products.oneOff({
		id: "one-off-tiered-cus",
		items: [tieredOneOffItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: oneOff.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});
});

test.concurrent(`${chalk.yellowBright("oneoff-prepaid-tiers: entity-level tiered one-off")}`, async () => {
	const customerId = "oneoff-tiers-entity";
	const quantity1 = 300;
	const quantity2 = 800;

	const expectedPrepaidCost1 = 2 * 10;
	const expectedTotal1 = BASE_PRICE + expectedPrepaidCost1;

	const expectedPrepaidCost2 = 5 * 10 + 2 * 5;
	const expectedTotal2 = BASE_PRICE + expectedPrepaidCost2;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const oneOff = products.oneOff({
		id: "one-off-tiered-ent",
		items: [tieredOneOffItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
	});
	expect(preview1.total).toBe(expectedTotal1);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	});

	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
	});
	expect(preview2.total).toBe(expectedTotal2);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: oneOff.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity1,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: oneOff.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity2,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: expectedTotal1,
	});
});
