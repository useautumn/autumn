/**
 * Legacy Attach V1 Trial Tests - Slice 2 of 3
 *
 * Migrated from:
 * - server/tests/attach/upgradeOld/upgradeOld1.test.ts (trial to paid upgrade)
 * - server/tests/attach/basic/basic8.test.ts (trial duplicates with same fingerprint)
 *
 * Tests V1 attach behavior for trial-related scenarios:
 * - Upgrading from trial to paid product
 * - Trial deduplication based on fingerprint (unique_fingerprint: true)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade from trial product to paid product
// (from legacy-upgrade.test.ts / upgradeOld1)
//
// Scenario:
// - Pro product ($20/month) with 7-day trial, dashboard + 10 messages
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

test.concurrent(
	`${chalk.yellowBright("legacy-trial 3: trial to paid upgrade")}`,
	async () => {
		const customerId = "legacy-trial-3";

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
				s.attach({ productId: proWithTrial.id }),
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Trial duplicates with same fingerprint
// (from basic8)
//
// Scenario:
// - Pro product with 7-day trial, unique_fingerprint: true
// - Customer 1 with fingerprint X attaches pro → gets trial
// - Customer 2 with same fingerprint X attaches pro → no trial, full price
//
// Expected:
// - Customer 1: trialing, invoice total $0
// - Customer 2: active (no trial), invoice total $20
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-trial 4: trial duplicates with same fingerprint")}`,
	async () => {
		const customerId = "legacy-trial-4";
		const customerId2 = "legacy-trial-4-dup";
		const randFingerprint = Math.random().toString(36).substring(2, 15);

		const proWithTrial = products.proWithTrial({
			id: "pro",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 10 }),
				items.adminRights(),
			],
			trialDays: 7,
			cardRequired: true,
			uniqueFingerprint: true,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					paymentMethod: "success",
					data: { fingerprint: randFingerprint },
				}),
				s.otherCustomers([
					{
						id: customerId2,
						paymentMethod: "success",
						data: { fingerprint: randFingerprint },
					},
				]),
				s.products({ list: [proWithTrial] }),
			],
			actions: [s.attach({ productId: proWithTrial.id })],
		});

		// Verify customer 1 is trialing with $0 invoice
		const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductTrialing({
			customer: customer1,
			productId: proWithTrial.id,
		});

		await expectCustomerInvoiceCorrect({
			customer: customer1,
			count: 1,
			latestTotal: 0,
		});

		// Attach same product to customer 2 (same fingerprint → no trial)
		await autumnV1.attach({
			customer_id: customerId2,
			product_id: proWithTrial.id,
		});

		// Verify customer 2 is active (not trialing) with $20 invoice
		const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId2);

		await expectProductActive({
			customer: customer2,
			productId: proWithTrial.id,
		});

		await expectCustomerInvoiceCorrect({
			customer: customer2,
			count: 1,
			latestTotal: 20,
		});
	},
);
