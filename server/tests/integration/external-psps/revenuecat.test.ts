/**
 * RevenueCat Integration Tests
 *
 * Migrated from:
 * - server/tests/integration/external-psps/revenuecat/revenuecat-webhooks.test.ts
 * - server/tests/integration/external-psps/revenuecat/revenuecat-migration.test.ts
 *
 * Tests RevenueCat webhook handling and customer migration:
 * - Initial purchase, renewal, upgrade/downgrade
 * - Cancellation, uncancellation, billing issues, expiration
 * - Non-renewing (one-off) purchases
 * - Product version migration
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	customers,
	ProcessorType,
} from "@autumn/shared";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";
import { TestFeature } from "@tests/setup/v2Features";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				processor_configs: {
					...ctx.org.processor_configs,
					revenuecat: {
						api_key: encryptData("mock_rc_api_key_live"),
						sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
						project_id: "mock_project_live",
						sandbox_project_id: "mock_project_sandbox",
						webhook_secret: RC_WEBHOOK_SECRET,
						sandbox_webhook_secret: RC_WEBHOOK_SECRET,
					},
				},
			},
		});
	}
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: RevenueCat webhook lifecycle (purchase, upgrade, cancel, expire, add-on)
// (from revenuecat-webhooks.test.ts)
//
// Scenario:
// - Pro Monthly, Pro Yearly, and Add-on products
// - Initial purchase → upgrade → downgrade → cancel → uncancel → billing issue → expire → add-on
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("revenuecat 1: webhook lifecycle")}`, async () => {
	const customerId = "rc-webhook-1";

	// RevenueCat product IDs
	const RC_PRO_MONTHLY_ID = "com.app.rc1_pro_monthly";
	const RC_PRO_YEARLY_ID = "com.app.rc1_pro_yearly";
	const RC_ADD_ON_ID = "com.app.rc1_add_on_pack";

	// Autumn products
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({ id: "pro-monthly", items: [messagesItem] });
	const proYearly = products.proAnnual({ id: "pro-yearly", items: [items.monthlyMessages({ includedUsage: 1000 })] });
	const addOnPack = products.base({
		id: "add-on",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
		isAddOn: true,
	});

	// Setup org with RevenueCat config
	await setupRevenueCatOrg();

	// Initialize scenario
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [proMonthly, proYearly, addOnPack] }),
		],
		actions: [],
	});

	// Create RC mappings
	await Promise.all([
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		}),
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proYearly.id,
				revenuecat_product_ids: [RC_PRO_YEARLY_ID],
			},
		}),
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: addOnPack.id,
				revenuecat_product_ids: [RC_ADD_ON_ID],
			},
		}),
	]);

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// Get internal customer ID
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	expect(dbCustomer).toBeDefined();
	const internalCustomerId = dbCustomer!.internal_id;

	// Helper to fetch latest active cus_product
	const fetchLatestActiveCusProductId = async () => {
		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		});
		const sorted = cusProducts.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
		expect(sorted.length > 0).toBe(true);
		return sorted[sorted.length - 1]!.id;
	};

	// 1. Initial Purchase - Pro Monthly
	let result = await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
	});
	expectWebhookSuccess(result);

	let customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proMonthly.id);
	let baselineCusProductId = await fetchLatestActiveCusProductId();

	// 2. Upgrade to Pro Yearly (via renewal)
	result = await rcClient.renewal({
		productId: RC_PRO_YEARLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proYearly.id);

	// 3. Downgrade to Pro Monthly (via initial purchase)
	result = await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proMonthly.id);

	const newCusProductId = await fetchLatestActiveCusProductId();
	expect(newCusProductId).not.toBe(baselineCusProductId);
	baselineCusProductId = newCusProductId;

	// 4. Cancellation
	result = await rcClient.cancellation({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
		expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proMonthly.id);
	expect(customer.products[0].canceled_at).toBeDefined();
	expect(Math.abs(Date.now() - (customer.products[0].canceled_at ?? 0))).toBeLessThanOrEqual(3000);

	// 5. Uncancellation
	result = await rcClient.uncancellation({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].canceled_at).toBeNull();

	// 6. Billing Issue
	result = await rcClient.billingIssue({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(String(customer.products[0].status)).toBe("past_due");

	// 7. Expiration
	result = await rcClient.expiration({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_tx_001",
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(0);

	// 8. Non-renewing purchase (add-on after expiration)
	result = await rcClient.nonRenewingPurchase({
		productId: RC_ADD_ON_ID,
		appUserId: customerId,
		originalTransactionId: "rc1_addon_tx_001",
	});
	expectWebhookSuccess(result);

	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(addOnPack.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: RevenueCat customer migration (v1 to v2 product version)
// (from revenuecat-migration.test.ts)
//
// Scenario:
// - Customer purchases Pro Monthly v1 via RevenueCat
// - Product is updated to v2 with increased usage
// - Customer is migrated from v1 to v2, preserving usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("revenuecat 2: customer migration v1 to v2")}`, async () => {
	const customerId = "rc-migration-1";
	const RC_PRO_MONTHLY_ID = "com.app.rc_migration_pro_monthly";

	// Pro Monthly v1
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({ id: "pro-monthly", items: [messagesItem] });

	// Setup org with RevenueCat config
	await setupRevenueCatOrg();

	// Initialize scenario
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	// Create RC mapping
	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// Get internal customer ID
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	expect(dbCustomer).toBeDefined();
	const internalCustomerId = dbCustomer!.internal_id;

	// 1. Initial purchase via RevenueCat
	const result = await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "migration_tx_001",
	});
	expectWebhookSuccess(result);

	let customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proMonthly.id);

	// Verify cus_product has RevenueCat processor
	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	expect(cusProducts).toHaveLength(1);
	expect(cusProducts[0].processor?.type).toBe(ProcessorType.RevenueCat);

	// 2. Update product to v2 with increased usage
	await autumnV1.products.update(proMonthly.id, {
		items: [
			items.monthlyMessages({ includedUsage: 2000 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	// 3. Track some usage before migration
	await autumnV1.track({
		customer_id: customerId,
		value: 500,
		feature_id: TestFeature.Messages,
	});
	await timeout(2000);

	// 4. Run migration
	await autumnV1.migrate({
		from_product_id: proMonthly.id,
		to_product_id: proMonthly.id,
		from_version: 1,
		to_version: 2,
	});
	await timeout(5000);

	// 5. Verify migration succeeded
	customer = await autumnV1.customers.get(customerId);
	expect(customer.products).toHaveLength(1);
	expect(customer.products[0].id).toBe(proMonthly.id);
	expect(customer.products[0].version).toBe(2);

	// Verify features reflect v2 (2000 included) with 500 usage
	const proMonthlyV2 = {
		...proMonthly,
		version: 2,
		items: [
			items.monthlyMessages({ includedUsage: 2000 }),
			items.monthlyPrice({ price: 20 }),
		],
	};

	expectFeaturesCorrect({
		customer,
		product: proMonthlyV2,
		usage: [
			{
				featureId: TestFeature.Messages,
				value: 500,
			},
		],
	});
});
