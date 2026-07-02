/**
 * TDD test for RevenueCat addon → prepaid feature quantity mapping.
 *
 * Maps a specific RevenueCat product id (e.g. an addons_50 SKU) onto a fixed
 * prepaid feature quantity of an Autumn add-on product, so purchasing that SKU
 * grants that quantity. Quantity is stored in FEATURE units; attach divides it
 * by billing_units internally (50 packs × 100 units = 5000 messages).
 *
 * Contract under test:
 *   New types/fields:
 *     - revenuecat_mappings.feature_quantities jsonb (nullable):
 *         { [revenuecat_product_id]: [{ feature_id, quantity }] }
 *   New behaviors:
 *     - RCMappingService.resolveMapping(rcProductId) ->
 *         { autumnProductId, featureQuantities? }
 *     - NON_RENEWING_PURCHASE of a mapped SKU with feature_quantities grants
 *         that quantity on the customer (balance == quantity).
 *     - A mapped SKU WITHOUT feature_quantities behaves as today (plain attach).
 *   Side effects:
 *     - cus_product attached with prepaid options derived from the mapping.
 *
 * Pre-impl red: feature_quantities does not exist on the mapping; the purchase
 * attaches the add-on with 0 prepaid quantity, so the balance is the included
 * usage (0), not 5000.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { customers } from "@autumn/shared";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_prepaid";

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
	`${chalk.yellowBright("revenuecat prepaid-mapping: SKU maps to a fixed prepaid feature quantity")}`,
	async () => {
		const customerId = "rc-prepaid-map-1";
		const RC_ADDON_50_ID = "com.app.rc_prepaid_addons_50";

		// $10 / 100 messages prepaid, one-off add-on (mirrors the credits add-on).
		const addOn = products.base({
			id: "rc-prepaid-addon",
			isAddOn: true,
			items: [
				items.prepaidMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
					interval: null,
				}),
			],
		});

		await setupRevenueCatOrg();

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false }),
				s.products({ list: [addOn] }),
			],
			actions: [],
		});

		// Map the SKU to 5000 messages (= 50 packs of 100 units).
		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: addOn.id,
				revenuecat_product_ids: [RC_ADDON_50_ID],
				feature_quantities: {
					[RC_ADDON_50_ID]: [
						{ feature_id: TestFeature.Messages, quantity: 5000 },
					],
				},
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		expectWebhookSuccess(
			await rcClient.nonRenewingPurchase({
				productId: RC_ADDON_50_ID,
				appUserId: customerId,
				originalTransactionId: "rc_prepaid_tx_001",
				transactionId: "rc_prepaid_tx_001",
				price: 50,
				purchasedAtMs: Date.now(),
			}),
		);

		// ── Contract assertion 1: add-on is active ───────────────────────────
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		expect(cusProducts.map((cp) => cp.product.id)).toContain(addOn.id);

		// ── Contract assertion 2: the mapped quantity was granted ────────────
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 5000,
		});
	},
);
