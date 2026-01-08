import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";

const billingUnits = 12;
const pricePerUnit = 8; // $8 per unit = $96 for 12 units

/**
 * Proration Configuration Tests
 *
 * These tests verify that the subscription update flow correctly handles
 * all proration configurations for both upgrades and downgrades.
 *
 * OnIncrease configs:
 * - BillImmediately: Bill full amount now (no proration)
 * - ProrateImmediately: Prorate and bill now (default)
 * - ProrateNextCycle: Prorate but bill next cycle
 * - BillNextCycle: Bill full amount next cycle
 *
 * OnDecrease configs:
 * - ProrateImmediately: Credit prorated amount now
 * - ProrateNextCycle: Credit next cycle
 * - None: No credit (replaceable strategy - set upcoming_quantity)
 * - NoProrations: No credit at all
 */

// =============================================================================
// UPGRADE PRORATION TESTS
// =============================================================================

// NOTE: OnIncrease.BillImmediately is not supported for prepaid items yet: 01/08/2026

test.concurrent(`${chalk.yellowBright("update-quantity: prorate immediately on upgrade")}`, async () => {
	const customerId = "proration-upgrade-prorate-immediately";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.ProrateImmediately,
				},
			}),
		],
	});
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	// Preview the upgrade
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	// Preview should show prorated amount (less than full $80)
	const fullAmount = 10 * pricePerUnit;
	expect(preview.total).toBeGreaterThan(0);
	expect(preview.total).toBeLessThanOrEqual(fullAmount);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	// Upgrade to 20 units
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should create invoice with prorated amount matching preview
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore + 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: prorate next cycle on upgrade")}`, async () => {
	const customerId = "proration-upgrade-prorate-next";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
				config: {
					on_increase: OnIncrease.ProrateNextCycle,
					on_decrease: OnDecrease.ProrateImmediately,
				},
			}),
		],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.advanceTestClock({ days: 15 }), // Mid-cycle
		],
	});

	// Preview the upgrade - should show prorated amount for next cycle
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	// Preview total should be 0 (billed next cycle, not immediately)
	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	// Upgrade to 20 units
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should NOT create finalized invoice immediately
	const finalizedInvoices = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

	// But balance should be updated immediately
	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(20 * billingUnits);

	// Advance clock to next billing cycle
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// NOW invoice should exist with prorated amount
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: bill next cycle on upgrade")}`, async () => {
	const customerId = "proration-upgrade-bill-next";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
				config: {
					on_increase: OnIncrease.BillNextCycle,
					on_decrease: OnDecrease.ProrateImmediately,
				},
			}),
		],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.advanceTestClock({ days: 15 }), // Mid-cycle
		],
	});

	// Preview the upgrade - should show 0 (billed next cycle)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	// Preview total should be 0 (billed next cycle, not immediately)
	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	// Upgrade to 20 units
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should NOT create invoice immediately
	expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

	// But balance should be updated
	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(20 * billingUnits);

	// Advance clock to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Next cycle invoice is the full renewal amount for 20 units
	// BillNextCycle defers billing - preview shows $0 for immediate charge
	const fullRenewalAmount = 20 * pricePerUnit; // 20 units * $8 = $160
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: (beforeInvoices.invoices?.length ?? 0) + 1,
		latestTotal: fullRenewalAmount,
		latestStatus: "paid",
	});
});

// =============================================================================
// DOWNGRADE PRORATION TESTS
// =============================================================================

test.concurrent(`${chalk.yellowBright("update-quantity: prorate immediately on downgrade")}`, async () => {
	const customerId = "proration-downgrade-prorate-immed";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.ProrateImmediately,
				},
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
				],
			}),
		],
	});

	// Preview the downgrade
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Preview should show negative (credit) prorated amount
	expect(preview.total).toBeLessThan(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	// Downgrade to 10 units
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should create invoice with credit matching preview
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore + 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});

	// Balance should be reduced
	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(10 * billingUnits);
});

test.concurrent(`${chalk.yellowBright("update-quantity: no prorations on downgrade")}`, async () => {
	const customerId = "proration-downgrade-no-prorations";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.NoProrations,
				},
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
				],
			}),
		],
	});

	// Preview the downgrade
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Preview should show 0 (no prorations = no credit)
	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	// Downgrade to 10 units
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should NOT create invoice (no credit)
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	// Balance should be reduced immediately (no credit, but balance updated)
	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(10 * billingUnits);
});
