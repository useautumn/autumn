/**
 * RevenueCat store periods: INITIAL_PURCHASE / RENEWAL stamp the store's
 * current period on `cusProduct.processor`, and the customer API returns it as
 * `current_period_start` / `current_period_end` (ms), like the Stripe path.
 *
 * The RC read client is served from mock fixtures, so these tests never touch
 * api.revenuecat.com.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
	customers,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
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
	type RevenueCatMockFixtures,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_period";
const DAY_MS = 1000 * 60 * 60 * 24;

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret ===
		RC_WEBHOOK_SECRET
	) {
		return;
	}

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
};

const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

const setupRcProduct = async ({
	customerId,
	productId,
	storeId,
}: {
	customerId: string;
	productId: string;
	storeId: string;
}) => {
	const proMonthly = products.base({
		id: productId,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	await setupRevenueCatOrg();

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ testClock: false, skipWebhooks: true }),
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
			revenuecat_product_ids: [storeId],
		},
	});

	return { autumnV2_2, proMonthly };
};

const getRcCusProduct = async ({
	customerId,
	autumnProductId,
}: {
	customerId: string;
	autumnProductId: string;
}) => {
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!dbCustomer) return undefined;

	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: dbCustomer.internal_id,
		inStatuses: [CusProductStatus.Active],
	});
	return cusProducts.find((cp) => cp.product.id === autumnProductId);
};

const pollUntil = async <T>(
	fn: () => Promise<T>,
	predicate: (value: T) => boolean,
	{ timeoutMs = 8000, intervalMs = 200 } = {},
): Promise<T> => {
	const start = Date.now();
	let last = await fn();
	while (!predicate(last) && Date.now() - start < timeoutMs) {
		await new Promise((r) => setTimeout(r, intervalMs));
		last = await fn();
	}
	return last;
};

test.concurrent(
	`${chalk.yellowBright("rc period: INITIAL_PURCHASE stores the store period and it survives the async processor id write")}`,
	async () => {
		const customerId = "rc-period-initial-cus";
		const RC_STORE_ID = "com.app.rc_period_initial_pro";
		const RC_INTERNAL_ID = "prod_rc_internal_period_initial";
		const SUB_ID = "sub_rc_period_initial_001";
		const purchasedAtMs = Date.now() - DAY_MS;
		const expirationAtMs = purchasedAtMs + 30 * DAY_MS;

		const { autumnV2_2, proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-initial-pro",
			storeId: RC_STORE_ID,
		});

		const mock: RevenueCatMockFixtures = {
			products: [
				{
					object: "product",
					id: RC_INTERNAL_ID,
					store_identifier: RC_STORE_ID,
					type: "subscription",
					created_at: purchasedAtMs,
					app_id: "app_mock",
					display_name: RC_STORE_ID,
				},
			],
			subscriptions: [
				{
					object: "subscription",
					id: SUB_ID,
					product_id: RC_INTERNAL_ID,
					store: "app_store",
					store_subscription_identifier: `store_${SUB_ID}`,
					status: "active",
					starts_at: purchasedAtMs,
					current_period_starts_at: purchasedAtMs,
					current_period_ends_at: expirationAtMs,
					auto_renewal_status: "will_renew",
					gives_access: true,
				},
			],
			purchases: [],
		};

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_initial_tx_001",
				purchasedAtMs,
				expirationAtMs,
				mock,
			}),
		);

		// Wait for the fire-and-forget processor id store, which must merge, not replace.
		const cusProduct = await pollUntil(
			() => getRcCusProduct({ customerId, autumnProductId: proMonthly.id }),
			(cp) => Boolean(cp?.processor?.id),
		);

		expect(cusProduct?.processor?.id).toBe(SUB_ID);
		expect(cusProduct?.processor?.current_period_start).toBe(purchasedAtMs);
		expect(cusProduct?.processor?.current_period_end).toBe(expirationAtMs);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const subscription = customer.subscriptions.find(
			(sub) => sub.plan_id === proMonthly.id,
		);
		expect(subscription?.current_period_start).toBe(purchasedAtMs);
		expect(subscription?.current_period_end).toBe(expirationAtMs);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc period: RENEWAL of the same product moves the period forward")}`,
	async () => {
		const customerId = "rc-period-renewal-cus";
		const RC_STORE_ID = "com.app.rc_period_renewal_pro";
		const firstStartMs = Date.now() - 31 * DAY_MS;
		const firstEndMs = firstStartMs + 30 * DAY_MS;
		const renewedStartMs = firstEndMs;
		const renewedEndMs = renewedStartMs + 30 * DAY_MS;

		const { autumnV2_2, proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-renewal-pro",
			storeId: RC_STORE_ID,
		});

		const client = newRcClient();
		expectWebhookSuccess(
			await client.initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_renewal_tx_001",
				purchasedAtMs: firstStartMs,
				expirationAtMs: firstEndMs,
			}),
		);

		expectWebhookSuccess(
			await client.renewal({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_renewal_tx_001",
				transactionId: "rc_period_renewal_tx_002",
				purchasedAtMs: renewedStartMs,
				expirationAtMs: renewedEndMs,
			}),
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const subscription = customer.subscriptions.find(
			(sub) => sub.plan_id === proMonthly.id,
		);
		expect(subscription?.current_period_start).toBe(renewedStartMs);
		expect(subscription?.current_period_end).toBe(renewedEndMs);
	},
);
