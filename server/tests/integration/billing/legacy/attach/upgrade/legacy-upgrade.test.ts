/**
 * Legacy Attach V1 Upgrade Tests
 *
 * Migrated from:
 * - server/tests/attach/upgradeOld/upgradeOld1.test.ts (trial to paid upgrade)
 *
 * Tests V1 attach behavior for product upgrades:
 * - Trial to paid upgrade
 * - Invoice totals after upgrade
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade from trial product to paid product
//
// Scenario:
// - Pro product ($20/month) with 7-day trial, 10 messages
// - Premium product ($50/month), 100 messages
// - Customer with payment method
// - Attach pro (starts trial)
// - Advance 3 days
// - Upgrade to premium → trial ends, premium starts
//
// Expected:
// - Customer has premium product after upgrade
// - Invoice total is $50 (premium price)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade 1: trial to paid upgrade")}`, async () => {
	const customerId = "legacy-upgrade-1";

	const proWithTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
		trialDays: 7,
		cardRequired: true,
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V0_1,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proWithTrial, premium] }),
		],
		actions: [
			// Attach pro with trial
			s.attach({ productId: proWithTrial.id }),
			// Advance 3 days into trial
			s.advanceTestClock({ days: 3 }),
		],
	});

	// Upgrade to premium
	await autumn.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await timeout(2500);

	// Check product, entitlements and invoices
	const res = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerV0Correct({
		sent: premium,
		cusRes: res,
	});

	const invoices = res.invoices;

	expect(invoices?.[0].total).toBe(50);
	expect(invoices?.[0].product_ids).toContain(premium.id);
});
