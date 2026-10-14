import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const BILLING_UNITS = 100;

const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase same tier 300→500")}`, async () => {
	const customerId = "volume-update-qty-increase-t1";
	const initQuantity = 300;
	const newQuantity = 500;

	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t1",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase crossing tier 300→800")}`, async () => {
	const customerId = "volume-update-qty-increase-t2";
	const initQuantity = 300;
	const newQuantity = 800;

	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 5 - (initQuantity / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t2",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase same tier 600→1000")}`, async () => {
	const customerId = "volume-update-qty-increase-t3";
	const initQuantity = 600;
	const newQuantity = 1000;

	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 5 - (initQuantity / BILLING_UNITS) * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t3",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: decrease same tier 500→300")}`, async () => {
	const customerId = "volume-update-qty-decrease-t1";
	const initQuantity = 500;
	const newQuantity = 300;

	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-dec-t1",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: decrease crossing tier 800→300")}`, async () => {
	const customerId = "volume-update-qty-decrease-t2";
	const initQuantity = 800;
	const newQuantity = 300;

	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-dec-t2",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

const INCLUDED_USAGE = 100;

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase with included 400→900")}`, async () => {
	const customerId = "volume-update-qty-incl-increase";
	const initQuantity = 400;
	const newQuantity = 900;
	const oldCost = (initQuantity / BILLING_UNITS) * 10;
	const newCost = (newQuantity / BILLING_UNITS) * 5;
	const expectedDelta = newCost - oldCost;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-incl-inc",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerAfter.features?.[TestFeature.Messages]?.balance).toBe(
		newQuantity,
	);

	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: product.id,
		amount: expectedDelta,
	});
});

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: decrease with included 900→400")}`, async () => {
	const customerId = "volume-update-qty-incl-decrease";
	const initQuantity = 900;
	const newQuantity = 400;
	const oldCost = (initQuantity / BILLING_UNITS) * 5;
	const newCost = (newQuantity / BILLING_UNITS) * 10;
	const expectedDelta = newCost - oldCost;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-incl-dec",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerAfter.features?.[TestFeature.Messages]?.balance).toBe(
		newQuantity,
	);

	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: product.id,
		amount: expectedDelta,
	});
});
