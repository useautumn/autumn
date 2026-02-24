import { expect, test } from "bun:test";
import type { ApiCustomer, ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PAID1: Set usage on paid allocated (increase past included → invoice)
// allocatedUsers: $10/seat, OnIncrease.BillImmediately, OnDecrease.None
// ═══════════════════════════════════════════════════════════════════

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

	// Initial state: 3 included seats, no usage
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 3,
		purchased_balance: 0,
		usage: 0,
	});

	// Set usage to 5: targetBalance = 3 + 0 - 5 = -2
	// 2 seats over included → should trigger BillImmediately → invoice for 2 * $10 = $20
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

	// Verify invoice was created: 1 subscription invoice + 1 seat upgrade invoice
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "paid",
		latestInvoiceProductId: proProd.id,
	});

	// Verify DB sync
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PAID2: Decrease usage on paid allocated (OnDecrease.None → no refund)
// ═══════════════════════════════════════════════════════════════════

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

	// First set usage to 6 (3 over included → invoice)
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

	// Verify 2 invoices: subscription + seat upgrade
	const customerV3Before =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Before,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 30,
		latestStatus: "paid",
	});

	// Now decrease usage to 4 (still 1 over included)
	// OnDecrease.None → no new invoice, replaceables created instead
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 4,
	});

	await timeout(4000);

	const afterDecrease = await autumnV2.customers.get<ApiCustomer>(customerId);

	// Replaceables: purchased_balance stays at 3 (no refund), current increases
	// current = granted + purchased - usage = 3 + 3 - 4 = 2
	expect(afterDecrease.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 2,
		purchased_balance: 3,
		usage: 4,
	});

	// Invoice count should stay at 2 (no new invoice for decrease)
	const customerV3After =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3After,
		count: 2,
	});

	// Now increase usage back to 6 — replaceables should cover this, no new invoice
	// purchased_balance was 3 (from original increase), so 6 usage = 3 included + 3 purchased → exact fit
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 6,
	});

	await timeout(4000);

	const afterReIncrease = await autumnV2.customers.get<ApiCustomer>(customerId);
	// current = granted + purchased - usage = 3 + 3 - 6 = 0
	expect(afterReIncrease.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 3,
		usage: 6,
	});

	// Invoice count should still be 2 — replaceables consumed, no new invoice
	const customerV3ReIncrease =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3ReIncrease,
		count: 2,
	});

	// Verify DB sync
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PAID3: Set usage within included (no invoice beyond subscription)
// ═══════════════════════════════════════════════════════════════════

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

	// Set usage to 3 (within 5 included): targetBalance = 5 - 3 = 2
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

	// Only 1 invoice (subscription), no extra seat invoice
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 1,
		latestStatus: "paid",
	});

	// Verify DB sync
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PAID4: Multiple usage updates with increasing/decreasing pattern
// ═══════════════════════════════════════════════════════════════════

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

	// Step 1: Set usage to 4 (2 over included → invoice for 2 * $10 = $20)
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

	// Step 2: Increase usage to 7 (5 over included, was 2 purchased → 3 more needed → invoice for 3 * $10 = $30)
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

	// Step 3: Decrease usage to 3 (1 over included, was 5 purchased → decrease by 4)
	// OnDecrease.None → no new invoice, replaceables created
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 3,
	});

	await timeout(4000);

	const after3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	// Replaceables: purchased_balance stays at 5 (no refund), current increases
	// current = granted + purchased - usage = 2 + 5 - 3 = 4
	expect(after3.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 4,
		purchased_balance: 5,
		usage: 3,
	});

	// Invoice count stays at 3 (no new invoice for decrease)
	const customerV3Step3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3Step3,
		count: 3,
	});

	// Verify DB sync
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
