/**
 * Immediate Switch Billing Interval Tests (Attach V2)
 *
 * Tests for upgrades involving billing interval changes.
 *
 * Key behaviors:
 * - Monthly to annual is treated as upgrade
 * - Full annual price charged on switch
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateCrossIntervalUpgrade } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Monthly to Annual
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro monthly ($20/mo)
 * - Upgrade to pro annual ($200/year)
 *
 * Expected Result:
 * - Annual product is active
 * - Correct charge for annual (prorated from monthly)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-billing-interval 1: monthly to annual")}`, async () => {
	const customerId = "imm-switch-monthly-to-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
		],
		actions: [s.billing.attach({ productId: proMonthly.id })],
	});

	// 1. Preview upgrade to annual
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	// Annual $200 - credit for unused monthly = ~$180
	// At start of cycle, full credit for $20 monthly
	expect(preview.total).toBe(180);

	// 2. Attach annual (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify annual is active
	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	// Verify monthly is removed
	await expectProductNotPresent({
		customer,
		productId: proMonthly.id,
	});

	// Verify features
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify invoices: monthly ($20) + annual upgrade ($180)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 180,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Monthly to Annual mid-cycle (prorated)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro monthly ($20/mo) attached on Jan 1
 * - Advance 1.5 cycles (renewal on Feb 1, then 15 more days to Feb 15)
 * - Upgrade to pro annual ($200/year)
 *
 * Expected Result:
 * - Credit for remaining monthly (Feb 15 → Mar 1)
 * - Prorated annual charge (Feb 15 → Jan 1 next year, ~10.5 months)
 * - Annual period anchors to original subscription start (Jan 1)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-billing-interval 2: to annual mid-cycle")}`, async () => {
	const customerId = "imm-switch-monthly-annual-mid";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proMonthly.id }),
			// Advance 1.5 cycles: renewal happens, then 15 more days into second cycle
			s.advanceTestClock({ months: 1, days: 15 }),
		],
	});

	// Calculate expected total using cross-interval proration utility
	const expectedTotal = await calculateCrossIntervalUpgrade({
		customerId,
		advancedTo,
		oldAmount: 20, // Monthly base price
		newAmount: 200, // Annual base price
	});

	// 1. Preview upgrade to annual mid-cycle
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Attach annual (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify annual is active
	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	// Verify monthly is removed
	await expectProductNotPresent({
		customer,
		productId: proMonthly.id,
	});

	// Verify features
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify invoices: monthly ($20) + renewal ($20) + prorated annual upgrade
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});
});
