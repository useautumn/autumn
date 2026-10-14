import { expect, test } from "bun:test";
import type { ApiCustomer, ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-usage-paid1: increase past included creates invoice")}`, async () => {
	const usersItem = items.allocatedUsers({ includedUsage: 3 });
	const proProd = products.pro({ id: "pro", items: [usersItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "update-usage-paid1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.billing.attach({ productId: proProd.id })],
	});

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 3,
		purchased_balance: 0,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 5,
	});

	await timeout(4000);

	const afterUsage = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUsage.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 2,
		usage: 5,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "paid",
		latestInvoiceProductId: proProd.id,
	});

	const afterUsageDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUsageDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 2,
		usage: 5,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-paid2: decrease usage creates no new invoice")}`, async () => {
	const usersItem = items.allocatedUsers({ includedUsage: 3 });
	const proProd = products.pro({ id: "pro", items: [usersItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "update-usage-paid2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.billing.attach({ productId: proProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 6,
	});

	const afterIncrease = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterIncrease.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 3,
		usage: 6,
	});

	await timeout(4000);

	const customerV3Before =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Before,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 30,
		latestStatus: "paid",
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 4,
	});

	await timeout(4000);

	const afterDecrease = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(afterDecrease.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 2,
		purchased_balance: 3,
		usage: 4,
	});

	const customerV3After =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3After,
		count: 2,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 6,
	});

	await timeout(4000);

	const afterReIncrease = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterReIncrease.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 3,
		usage: 6,
	});

	const customerV3ReIncrease =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3ReIncrease,
		count: 2,
	});

	const afterDecreaseDb = await autumnV2.customers.get<ApiCustomer>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expect(afterDecreaseDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 3,
		usage: 6,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-paid3: usage within included creates no extra invoice")}`, async () => {
	const usersItem = items.allocatedUsers({ includedUsage: 5 });
	const proProd = products.pro({ id: "pro", items: [usersItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "update-usage-paid3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.billing.attach({ productId: proProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 3,
	});

	await timeout(4000);

	const afterUsage = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUsage.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 2,
		purchased_balance: 0,
		usage: 3,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 1,
		latestStatus: "paid",
	});

	const afterUsageDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUsageDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 2,
		purchased_balance: 0,
		usage: 3,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-paid4: multiple usage updates with invoice tracking")}`, async () => {
	const usersItem = items.allocatedUsers({ includedUsage: 2 });
	const proProd = products.pro({ id: "pro", items: [usersItem] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "update-usage-paid4",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.billing.attach({ productId: proProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 4,
	});

	await timeout(4000);

	const after1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after1.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 0,
		purchased_balance: 2,
		usage: 4,
	});

	const customerV3Step1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Step1,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "paid",
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 7,
	});

	await timeout(4000);

	const after2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after2.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 0,
		purchased_balance: 5,
		usage: 7,
	});

	const customerV3Step2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Step2,
		count: 3,
		invoiceIndex: 0,
		latestTotal: 30,
		latestStatus: "paid",
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 3,
	});

	await timeout(4000);

	const after3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after3.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 4,
		purchased_balance: 5,
		usage: 3,
	});

	const customerV3Step3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Step3,
		count: 3,
	});

	const afterDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 4,
		purchased_balance: 5,
		usage: 3,
	});
});
