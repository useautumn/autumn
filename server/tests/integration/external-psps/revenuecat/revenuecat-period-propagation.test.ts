/**
 * RevenueCat period and processor id must reach every copy of the plan, not just Postgres.
 *
 * Renewal webhook — Red (before): billing.updated for a renewal carried null current_period_start/end.
 *                   Green (after): it carries the renewed store period (ms).
 * Cached id — Red (before): the async processor id merge updated Postgres but not a cache built before it landed.
 *             Green (after): the id merge invalidates the cache, so the next read carries the id.
 * Cache race — Red (before): the id store's whole-processor cache patch landed after a renewal's, regressing the cached period.
 *              Green (after): processor writers invalidate instead of patching, so reads rebuild from Postgres.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { waitForBillingUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { storeRevenueCatProcessorId } from "@/external/revenueCat/misc/provisionRevenueCatCusProduct";
import { storeRevenueCatPeriod } from "@/external/revenueCat/utils/revenueCatPeriod";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject";
import { ProductService } from "@/internal/products/ProductService";
import {
	expectWebhookSuccess,
	type RevenueCatMockFixtures,
} from "./utils/revenue-cat-webhook-client";
import {
	DAY_MS,
	getRcCusProduct,
	newRcClient,
	pollUntil,
	setupRcProduct,
	setupRevenueCatOrg,
} from "./utils/revenuecatPeriodTestUtils";

const mockRcCatalog = ({
	internalId,
	storeId,
	subId,
	startMs,
}: {
	internalId: string;
	storeId: string;
	subId: string;
	startMs: number;
}): RevenueCatMockFixtures => ({
	products: [
		{
			object: "product",
			id: internalId,
			store_identifier: storeId,
			type: "subscription",
			created_at: startMs,
			app_id: "app_mock",
			display_name: storeId,
		},
	],
	subscriptions: [
		{
			object: "subscription",
			id: subId,
			product_id: internalId,
			store: "app_store",
			store_subscription_identifier: `store_${subId}`,
			status: "active",
			starts_at: startMs,
			current_period_starts_at: startMs,
			current_period_ends_at: startMs + 30 * DAY_MS,
			auto_renewal_status: "will_renew",
			gives_access: true,
		},
	],
	purchases: [],
});

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	await setupRevenueCatOrg();
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(
	`${chalk.yellowBright("rc period propagation: renewal billing.updated carries the renewed period")}`,
	async () => {
		const customerId = "rc-period-webhook-cus";
		const RC_STORE_ID = "com.app.rc_period_webhook_pro";
		const firstStartMs = Date.now() - 31 * DAY_MS;
		const renewedStartMs = firstStartMs + 30 * DAY_MS;
		const renewedEndMs = renewedStartMs + 30 * DAY_MS;

		const { proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-webhook-pro",
			storeId: RC_STORE_ID,
		});

		const client = newRcClient();
		expectWebhookSuccess(
			await client.initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_webhook_tx_001",
				purchasedAtMs: firstStartMs,
				expirationAtMs: renewedStartMs,
			}),
		);
		expectWebhookSuccess(
			await client.renewal({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_webhook_tx_001",
				transactionId: "rc_period_webhook_tx_002",
				purchasedAtMs: renewedStartMs,
				expirationAtMs: renewedEndMs,
			}),
		);

		const billingUpdated = await waitForBillingUpdatedWebhook({
			playToken,
			customerId,
		});
		const change = billingUpdated?.plan_changes.find(
			(planChange) => planChange.subscription?.plan_id === proMonthly.id,
		);

		expect(change?.action).toBe("updated");
		expect(change?.subscription?.current_period_start).toBe(renewedStartMs);
		expect(change?.subscription?.current_period_end).toBe(renewedEndMs);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc period propagation: async processor id reaches a cache built before it landed")}`,
	async () => {
		const customerId = "rc-period-cache-cus";
		const RC_STORE_ID = "com.app.rc_period_cache_pro";
		const RC_INTERNAL_ID = "prod_rc_internal_period_cache";
		const SUB_ID = "sub_rc_period_cache_001";
		const nowMs = Date.now();

		const { autumnV2_2, proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-cache-pro",
			storeId: RC_STORE_ID,
		});

		// No mock RC client on the webhook, so the id lookup skips and the plan has no id yet.
		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_cache_tx_001",
			}),
		);
		const cusProduct = await pollUntil(
			() => getRcCusProduct({ customerId, autumnProductId: proMonthly.id }),
			(cp) => Boolean(cp),
		);
		expect(cusProduct?.processor?.id).toBeFalsy();

		// Build the cache while the id is still missing.
		await autumnV2_2.customers.get(customerId);

		const mock = mockRcCatalog({
			internalId: RC_INTERNAL_ID,
			storeId: RC_STORE_ID,
			subId: SUB_ID,
			startMs: nowMs,
		});
		const product = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proMonthly.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await storeRevenueCatProcessorId({
			ctx: {
				...ctx,
				testOptions: { mockRevenueCat: true, revenueCat: mock },
			},
			cusProduct: cusProduct!,
			product,
			appUserId: customerId,
		});

		// A normal read rebuilds the cache; it must now carry the id.
		await autumnV2_2.customers.get(customerId);
		const { fullSubject: cached } = await getCachedFullSubject({
			ctx,
			customerId,
			source: "integration-test",
		});
		const cachedProduct = cached?.customer_products.find(
			(cp) => cp.id === cusProduct!.id,
		);
		expect(cachedProduct).toBeDefined();
		expect(cachedProduct?.processor?.id).toBe(SUB_ID);
	},
);

/** A ctx whose cusProduct cache patch parks until released, to force a late cache write. */
const withParkedCachePatch = () => {
	let markReached: () => void = () => {};
	let release: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		markReached = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	const redisV2 = new Proxy(ctx.redisV2, {
		get: (target, prop) => {
			if (prop === "updateFullSubjectCustomerProductV2") {
				return async (...args: string[]) => {
					markReached();
					await released;
					return target.updateFullSubjectCustomerProductV2(
						...(args as [string, string, string, string]),
					);
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return { redisV2, reached, release };
};

test.concurrent(
	`${chalk.yellowBright("rc period propagation: a late processor id cache write does not regress the cached period")}`,
	async () => {
		const customerId = "rc-period-race-cus";
		const RC_STORE_ID = "com.app.rc_period_race_pro";
		const RC_INTERNAL_ID = "prod_rc_internal_period_race";
		const SUB_ID = "sub_rc_period_race_001";
		const janStartMs = Date.now() - DAY_MS;
		const febStartMs = janStartMs + 30 * DAY_MS;
		const febEndMs = febStartMs + 30 * DAY_MS;

		const { autumnV2_2, proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-race-pro",
			storeId: RC_STORE_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_race_tx_001",
				purchasedAtMs: janStartMs,
				expirationAtMs: febStartMs,
			}),
		);
		const cusProduct = await pollUntil(
			() => getRcCusProduct({ customerId, autumnProductId: proMonthly.id }),
			(cp) => Boolean(cp),
		);
		await autumnV2_2.customers.get(customerId);

		const product = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proMonthly.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const parked = withParkedCachePatch();

		// Id store merges {id, Jan} in Postgres, then parks before its cache write.
		const idStore = storeRevenueCatProcessorId({
			ctx: {
				...ctx,
				redisV2: parked.redisV2,
				testOptions: {
					mockRevenueCat: true,
					revenueCat: mockRcCatalog({
						internalId: RC_INTERNAL_ID,
						storeId: RC_STORE_ID,
						subId: SUB_ID,
						startMs: janStartMs,
					}),
				},
			},
			cusProduct: cusProduct!,
			product,
			appUserId: customerId,
		});
		await Promise.race([parked.reached, idStore]);

		// The renewal lands in between and moves the period to Feb.
		await storeRevenueCatPeriod({
			ctx,
			customerProduct: cusProduct!,
			event: { purchased_at_ms: febStartMs, expiration_at_ms: febEndMs },
		});

		parked.release();
		await idStore;

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const subscription = customer.subscriptions.find(
			(sub) => sub.plan_id === proMonthly.id,
		);
		expect(subscription?.current_period_end).toBe(febEndMs);
	},
);
