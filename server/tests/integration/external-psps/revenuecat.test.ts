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
	type ApiCustomerV3,
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
	CustomerExpand,
	customers,
	invoices,
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
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";
import { TestFeature } from "@tests/setup/v2Features";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

const rcProMonthly = ({ id = "pro-monthly" }: { id?: string } = {}) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

const rcProYearly = ({ id = "pro-yearly" }: { id?: string } = {}) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 1000 }),
			items.annualPrice({ price: 1000 }),
		],
	});

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
	const proMonthly = rcProMonthly();
	const proYearly = rcProYearly();
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: RevenueCat invoice rows
//
// Contract under test:
//   New behaviors:
//     - INITIAL_PURCHASE event ⇒ INSERT invoices row with
//         { stripe_id: transaction_id, processor_type: "revenuecat",
//           status: "paid", total: price, amount_paid: price,
//           refunded_amount: 0, currency, items: [], discounts: [] }
//     - RENEWAL with new transaction_id ⇒ INSERT another row
//     - NON_RENEWING_PURCHASE ⇒ INSERT same shape as INITIAL_PURCHASE
//     - CANCELLATION + cancel_reason="CUSTOMER_SUPPORT" (or price<0) ⇒
//         UPDATE matching row SET refunded_amount = total
//     - CANCELLATION without refund signal ⇒ existing row unchanged
//   Side effects:
//     - DB: invoices rows
//     - Cache: invalidated (deleteCachedFullCustomer + invalidateCachedFullSubject)
//     - NO Stripe API calls; NO Lua patch
//   Wire round-trip:
//     - autumnV1.customers.get<ApiCustomerV3>(id).invoices contains the RC invoice
//       with stripe_id == transaction_id, total == price, currency, status=paid.
//     - autumnV2_1.customers.get<ApiCustomerV5>(id, { expand:["invoices"] }).invoices
//       additionally exposes processor_type === "revenuecat".
//     - Direct DB read (CusService.getFull with expand=invoices) confirms
//       processor_type stored as "revenuecat".
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("revenuecat 3: writes invoice rows for INITIAL_PURCHASE / RENEWAL / NON_RENEWING_PURCHASE, refunds existing invoice for CANCELLATION-as-refund")}`,
	async () => {
		const customerId = "rc-invoices-1";
		const nonRenewingCustomerId = "rc-invoices-nonrenewing-1";

		const RC_PRO_MONTHLY_ID = "com.app.rc3_pro_monthly";
		const RC_ADD_ON_ID = "com.app.rc3_add_on_pack";

		const proMonthly = products.pro({
			id: "rc3-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const addOnPack = products.base({
			id: "rc3-add-on",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly, addOnPack] }),
			],
			actions: [],
		});

		// Initialize the second (non-renewing) customer in the same scenario context
		await initScenario({
			customerId: nonRenewingCustomerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

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

		// ─── Assertion 1: INITIAL_PURCHASE writes an invoice row ────────────────
		const initialTxId = "rc3_tx_initial_001";
		const initialPrice = 9.99;
		// RevenueCat's `price` is normalized to USD; `currency` describes the
		// purchase currency only. A non-USD purchase must still record total in
		// USD with currency "usd" (regression: INR-labeled USD amounts).
		const initialCurrency = "inr";
		const initialPurchasedAt = Date.now();

		expectWebhookSuccess(
			await rcClient.initialPurchase({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: "rc3_orig_tx_001",
				transactionId: initialTxId,
				price: initialPrice,
				currency: initialCurrency,
				purchasedAtMs: initialPurchasedAt,
			}),
		);

		let v1Customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(v1Customer.invoices).toBeDefined();
		expect(v1Customer.invoices).toHaveLength(1);

		const initialInvoiceV1 = v1Customer.invoices![0]!;
		expect(initialInvoiceV1.stripe_id).toBe(initialTxId);
		expect(initialInvoiceV1.total).toBe(initialPrice);
		expect(initialInvoiceV1.currency).toBe("usd");
		expect(initialInvoiceV1.status).toBe("paid");

		// V5 fetch exposes processor_type
		const v5Customer = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
			{
				expand: [CustomerExpand.Invoices],
			},
		);
		expect(v5Customer.invoices).toBeDefined();
		expect(v5Customer.invoices).toHaveLength(1);
		const initialInvoiceV5 = v5Customer.invoices![0]!;
		expect(initialInvoiceV5.processor_type).toBe(ProcessorType.RevenueCat);
		expect(initialInvoiceV5.stripe_id).toBe(initialTxId);
		expect(initialInvoiceV5.total).toBe(initialPrice);
		expect(initialInvoiceV5.currency).toBe("usd");
		expect(initialInvoiceV5.status).toBe("paid");

		// ─── Assertion 2: RENEWAL with new transaction_id writes a second row ──
		const renewalTxId = "rc3_tx_renewal_002";
		const renewalPrice = 9.99;

		expectWebhookSuccess(
			await rcClient.renewal({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: "rc3_orig_tx_001",
				transactionId: renewalTxId,
				price: renewalPrice,
				currency: initialCurrency,
				purchasedAtMs: Date.now(),
			}),
		);

		v1Customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(v1Customer.invoices).toHaveLength(2);
		const renewalInvoice = v1Customer.invoices!.find(
			(inv) => inv.stripe_id === renewalTxId,
		);
		expect(renewalInvoice).toBeDefined();
		expect(renewalInvoice!.total).toBe(renewalPrice);
		expect(renewalInvoice!.status).toBe("paid");

		// ─── Assertion 3: NON_RENEWING_PURCHASE on a different customer ────────
		const nonRenewingTxId = "rc3_tx_nonrenewing_001";
		const nonRenewingPrice = 4.99;

		expectWebhookSuccess(
			await rcClient.nonRenewingPurchase({
				productId: RC_ADD_ON_ID,
				appUserId: nonRenewingCustomerId,
				originalTransactionId: "rc3_orig_tx_nr_001",
				transactionId: nonRenewingTxId,
				price: nonRenewingPrice,
				currency: initialCurrency,
				purchasedAtMs: Date.now(),
			}),
		);

		const nrV1Customer =
			await autumnV1.customers.get<ApiCustomerV3>(nonRenewingCustomerId);
		expect(nrV1Customer.invoices).toBeDefined();
		expect(nrV1Customer.invoices).toHaveLength(1);
		const nrInvoice = nrV1Customer.invoices![0]!;
		expect(nrInvoice.stripe_id).toBe(nonRenewingTxId);
		expect(nrInvoice.total).toBe(nonRenewingPrice);
		expect(nrInvoice.status).toBe("paid");

		// ─── Assertion 4: CANCELLATION without refund signal — invoice unchanged
		expectWebhookSuccess(
			await rcClient.cancellation({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: "rc3_orig_tx_001",
				transactionId: renewalTxId,
				cancelReason: "UNSUBSCRIBE",
				price: renewalPrice,
				expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
			}),
		);

		const renewalRowAfterPlainCancel = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, renewalTxId),
		});
		expect(renewalRowAfterPlainCancel).toBeDefined();
		expect(Number(renewalRowAfterPlainCancel!.refunded_amount)).toBe(0);

		// Also reactivate the cus_product so a second cancellation refund can fire
		// (the previous CANCELLATION marked it cancelled; uncancellation reactivates).
		expectWebhookSuccess(
			await rcClient.uncancellation({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalAppUserId: "rc3_orig_tx_001",
			}),
		);

		// ─── Assertion 5: CANCELLATION with cancel_reason CUSTOMER_SUPPORT bumps refund
		expectWebhookSuccess(
			await rcClient.cancellation({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: "rc3_orig_tx_001",
				transactionId: renewalTxId,
				cancelReason: "CUSTOMER_SUPPORT",
				price: -renewalPrice,
				expirationAtMs: Date.now(),
			}),
		);

		const renewalRowAfterRefund = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, renewalTxId),
		});
		expect(renewalRowAfterRefund).toBeDefined();
		expect(Number(renewalRowAfterRefund!.refunded_amount)).toBe(renewalPrice);
		expect(Number(renewalRowAfterRefund!.total)).toBe(renewalPrice);

		// ─── Assertion 6: V1 fetch returns RC invoices with stripe_id populated ─
		v1Customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const v1TxIds = v1Customer.invoices!.map((inv) => inv.stripe_id).sort();
		expect(v1TxIds).toContain(initialTxId);
		expect(v1TxIds).toContain(renewalTxId);

		// ─── Assertion 7: Direct DB read confirms processor_type = "revenuecat"
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			expand: ["invoices" as any],
		});
		expect(fullCustomer.invoices).toBeDefined();
		const invoiceTxIdsInDb = (fullCustomer.invoices ?? [])
			.map((inv) => inv.stripe_id)
			.sort();
		expect(invoiceTxIdsInDb).toContain(initialTxId);
		expect(invoiceTxIdsInDb).toContain(renewalTxId);
		for (const inv of fullCustomer.invoices ?? []) {
			if (inv.stripe_id === initialTxId || inv.stripe_id === renewalTxId) {
				expect(inv.processor_type).toBe(ProcessorType.RevenueCat);
			}
		}
	},
);
