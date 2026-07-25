/**
 * RevenueCat subscription + Stripe-billed auto top-up.
 *
 * A customer with a Stripe customer + card on file purchases a subscription
 * (monthly base price + one-off prepaid messages item) through RevenueCat.
 * When the prepaid balance drops below the auto top-up threshold, the top-up
 * should bill through Stripe even though the cus_product is RC-provisioned.
 *
 * Probes:
 * - RC attach (no_billing_changes) creates the cusPrice for the one-off
 *   prepaid item, so fullCustomerToAutoTopupObjects can find it.
 * - Auto top-up executes a paid Stripe invoice for an RC cus_product whose
 *   prices were never provisioned in Stripe.
 * - The options.quantity bump lands on the RC cus_product.
 * - A subsequent RC RENEWAL does not clobber the topped-up state.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
	customers,
	ProcessorType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features";
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

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_auto_topup";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 20000;

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

test.concurrent(
	`${chalk.yellowBright("revenuecat auto-topup: RC subscription tops up prepaid balance through Stripe")}`,
	async () => {
		const customerId = "rc-auto-topup-stripe-1";
		const RC_SUB_SKU = "com.app.rc_auto_topup_sub_monthly";

		// $20/month subscription carrying a one-off prepaid item ($10 / 100 messages)
		const sub = products.pro({
			id: "rc-topup-sub",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		await setupRevenueCatOrg();

		// Stripe customer + card on file, but NO Stripe products attached — the
		// cross-processor guard only rejects non-RC cus_products with subscriptions.
		const { autumnV2_1, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [sub] }),
			],
			actions: [],
		});

		// Map the RC SKU to the sub, granting 500 messages (5 packs) on purchase.
		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: sub.id,
				revenuecat_product_ids: [RC_SUB_SKU],
				feature_quantities: {
					[RC_SUB_SKU]: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				},
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		expectWebhookSuccess(
			await rcClient.initialPurchase({
				productId: RC_SUB_SKU,
				appUserId: customerId,
				originalTransactionId: "rc_auto_topup_tx_001",
				transactionId: "rc_auto_topup_tx_001",
				price: 20,
				purchasedAtMs: Date.now(),
			}),
		);

		// ── 1. RC cus_product is active with the mapped prepaid grant ──────────
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		const rcCusProduct = cusProducts.find((cp) => cp.product.id === sub.id);
		expect(rcCusProduct).toBeDefined();
		expect(rcCusProduct!.processor?.type).toBe(ProcessorType.RevenueCat);

		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: before,
			featureId: TestFeature.Messages,
			remaining: 500,
		});

		// ── 2. Enable auto top-up (threshold 20, quantity 100 = 1 pack) ────────
		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});

		// ── 3. Track below threshold → auto top-up should bill via Stripe ─────
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 490,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		// Balance: 500 - 490 + 100 = 110
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 110,
		});

		// Latest invoice is the Stripe top-up: 1 pack × $10, paid.
		// Count 2 = RC-recorded purchase invoice + Stripe top-up invoice.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: sub.id,
		});

		// Options: 5 initial packs + 1 topped-up pack = 6.
		await expectCustomerProductOptions({
			ctx: scenarioCtx,
			customerId,
			productId: sub.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});

		// ── 4. RC renewal must not clobber the topped-up state ─────────────────
		expectWebhookSuccess(
			await rcClient.renewal({
				productId: RC_SUB_SKU,
				appUserId: customerId,
				originalTransactionId: "rc_auto_topup_tx_001",
				transactionId: "rc_auto_topup_tx_002",
				price: 20,
				purchasedAtMs: Date.now(),
			}),
		);

		const afterRenewal =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterRenewal,
			featureId: TestFeature.Messages,
			remaining: 110,
		});
		await expectCustomerProductOptions({
			ctx: scenarioCtx,
			customerId,
			productId: sub.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});
	},
);
