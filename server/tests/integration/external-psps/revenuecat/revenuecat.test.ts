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
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

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

const INVOICE_TEST_CUSTOMER_IDS = [
	"rc-invoices-1",
	"rc-invoices-nonrenewing-1",
];
const INVOICE_TEST_TX_IDS = [
	"rc3_tx_initial_001",
	"rc3_tx_renewal_002",
	"rc3_tx_nonrenewing_001",
];

const clearInvoiceTestData = async () => {
	await ctx.db
		.delete(invoices)
		.where(inArray(invoices.stripe_id, INVOICE_TEST_TX_IDS));

	for (const customerId of INVOICE_TEST_CUSTOMER_IDS) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "revenuecat-test-cleanup",
		}).catch(() => {});
	}
};

test.concurrent(
	`${chalk.yellowBright("revenuecat 1: webhook lifecycle")}`,
	async () => {
		const customerId = "rc-webhook-1";

		const RC_PRO_MONTHLY_ID = "com.app.rc1_pro_monthly";
		const RC_PRO_YEARLY_ID = "com.app.rc1_pro_yearly";
		const RC_ADD_ON_ID = "com.app.rc1_add_on_pack";

		const proMonthly = rcProMonthly();
		const proYearly = rcProYearly();
		const addOnPack = products.base({
			id: "add-on",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly, proYearly, addOnPack] }),
			],
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

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();
		const internalCustomerId = dbCustomer!.internal_id;

		const fetchLatestActiveCusProductId = async () => {
			const cusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId,
				inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
			});
			const sorted = cusProducts.sort(
				(a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
			);
			expect(sorted.length > 0).toBe(true);
			return sorted[sorted.length - 1]!.id;
		};

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

		result = await rcClient.renewal({
			productId: RC_PRO_YEARLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc1_tx_001",
		});
		expectWebhookSuccess(result);

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proYearly.id);

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
		expect(
			Math.abs(Date.now() - (customer.products[0].canceled_at ?? 0)),
		).toBeLessThanOrEqual(3000);

		result = await rcClient.uncancellation({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
		});
		expectWebhookSuccess(result);

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].canceled_at).toBeNull();

		result = await rcClient.billingIssue({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc1_tx_001",
		});
		expectWebhookSuccess(result);

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(String(customer.products[0].status)).toBe("past_due");

		result = await rcClient.expiration({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc1_tx_001",
		});
		expectWebhookSuccess(result);

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(0);

		result = await rcClient.nonRenewingPurchase({
			productId: RC_ADD_ON_ID,
			appUserId: customerId,
			originalTransactionId: "rc1_addon_tx_001",
		});
		expectWebhookSuccess(result);

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(addOnPack.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat 2: customer migration v1 to v2")}`,
	async () => {
		const customerId = "rc-migration-1";
		const RC_PRO_MONTHLY_ID = "com.app.rc_migration_pro_monthly";

		const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [messagesItem],
		});

		await setupRevenueCatOrg();

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

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

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();
		const internalCustomerId = dbCustomer!.internal_id;

		const result = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "migration_tx_001",
		});
		expectWebhookSuccess(result);

		let customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);

		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active],
		});
		expect(cusProducts).toHaveLength(1);
		expect(cusProducts[0].processor?.type).toBe(ProcessorType.RevenueCat);
		expect(cusProducts[0].is_custom).toBe(false);

		await autumnV1.products.update(proMonthly.id, {
			items: [
				items.monthlyMessages({ includedUsage: 2000 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			value: 500,
			feature_id: TestFeature.Messages,
		});
		await timeout(2000);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig-${Date.now()}`,
			customerId,
			filter: {
				customer: {
					customer_id: customerId,
					plan: { plan_id: proMonthly.id, version: 1 },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: proMonthly.id, version: 1 },
						version: 2,
					},
				],
			},
			waitFor: async () => {
				const migrated = await autumnV1.customers.get(customerId);
				expect(migrated.products[0]?.version).toBe(2);
			},
		});

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
		expect(customer.products[0].version).toBe(2);

		const migratedCusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active],
		});
		expect(migratedCusProducts).toHaveLength(1);
		expect(migratedCusProducts[0].processor?.type).toBe(
			ProcessorType.RevenueCat,
		);
		expect(migratedCusProducts[0].processor).toEqual(cusProducts[0].processor);

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
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat 3: writes invoice rows for INITIAL_PURCHASE / RENEWAL / NON_RENEWING_PURCHASE, refunds existing invoice for CANCELLATION-as-refund")}`,
	async () => {
		await clearInvoiceTestData();

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
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly, addOnPack] }),
			],
			actions: [],
		});

		await initScenario({
			customerId: nonRenewingCustomerId,
			setup: [
				s.deleteCustomer({ customerId: nonRenewingCustomerId }),
				s.customer({ testClock: false }),
			],
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

		const initialTxId = "rc3_tx_initial_001";
		const initialPrice = 9.99;
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

		const [initialInvoiceRow] = await ctx.db
			.select({ paidAt: invoices.paid_at })
			.from(invoices)
			.where(eq(invoices.stripe_id, initialTxId));
		expect(initialInvoiceRow?.paidAt).toBe(initialPurchasedAt);

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

		const nrV1Customer = await autumnV1.customers.get<ApiCustomerV3>(
			nonRenewingCustomerId,
		);
		expect(nrV1Customer.invoices).toBeDefined();
		expect(nrV1Customer.invoices).toHaveLength(1);
		const nrInvoice = nrV1Customer.invoices![0]!;
		expect(nrInvoice.stripe_id).toBe(nonRenewingTxId);
		expect(nrInvoice.total).toBe(nonRenewingPrice);
		expect(nrInvoice.status).toBe("paid");

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

		expectWebhookSuccess(
			await rcClient.uncancellation({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalAppUserId: "rc3_orig_tx_001",
			}),
		);

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

		v1Customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const v1TxIds = v1Customer.invoices!.map((inv) => inv.stripe_id).sort();
		expect(v1TxIds).toContain(initialTxId);
		expect(v1TxIds).toContain(renewalTxId);

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

		await clearInvoiceTestData();
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat 4: renewal on cancelled + past due product clears cancellation")}`,
	async () => {
		const customerId = "rc-renewal-cancelled-pastdue";
		const RC_PRO_MONTHLY_ID = "com.app.rc4_pro_monthly";
		const RC_ORIGINAL_TX_ID = "rc4_tx_001";

		const proMonthly = rcProMonthly({ id: "rc4-pro-monthly" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

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

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();
		const internalCustomerId = dbCustomer!.internal_id;

		const fetchCustomerProduct = async () => {
			const cusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId,
				inStatuses: [
					CusProductStatus.Active,
					CusProductStatus.PastDue,
					CusProductStatus.Scheduled,
					CusProductStatus.Expired,
				],
			});
			const customerProduct = cusProducts.find(
				(cp) => cp.product.id === proMonthly.id,
			);
			expect(customerProduct).toBeDefined();
			return customerProduct!;
		};

		expectWebhookSuccess(
			await rcClient.initialPurchase({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: RC_ORIGINAL_TX_ID,
			}),
		);

		const expirationAtMs = Date.now() + 1000 * 60 * 60 * 24 * 30;

		expectWebhookSuccess(
			await rcClient.cancellation({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: RC_ORIGINAL_TX_ID,
				expirationAtMs,
			}),
		);

		const afterCancellation = await fetchCustomerProduct();
		expect(afterCancellation.canceled).toBe(true);
		expect(afterCancellation.canceled_at).not.toBeNull();
		expect(afterCancellation.ended_at).toBe(expirationAtMs);

		expectWebhookSuccess(
			await rcClient.billingIssue({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: RC_ORIGINAL_TX_ID,
			}),
		);

		const afterBillingIssue = await fetchCustomerProduct();
		expect(afterBillingIssue.status).toBe(CusProductStatus.PastDue);
		expect(afterBillingIssue.canceled).toBe(true);

		expectWebhookSuccess(
			await rcClient.renewal({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: RC_ORIGINAL_TX_ID,
			}),
		);

		const afterRenewal = await fetchCustomerProduct();
		expect(afterRenewal.status).toBe(CusProductStatus.Active);
		expect(afterRenewal.canceled).toBe(false);
		expect(afterRenewal.canceled_at).toBeNull();
		expect(afterRenewal.ended_at).toBeNull();
	},
);
