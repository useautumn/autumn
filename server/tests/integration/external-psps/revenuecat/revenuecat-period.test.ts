/**
 * RevenueCat store periods: INITIAL_PURCHASE / RENEWAL stamp the store's
 * current period on `cusProduct.processor`, and the customer API returns it as
 * `current_period_start` / `current_period_end` (ms), like the Stripe path.
 *
 * The RC read client is served from mock fixtures, so these tests never touch
 * api.revenuecat.com.
 *
 * Stale renewal — Red (before): a redelivered older RENEWAL moved the period backward.
 *                 Green (after): the period only moves forward.
 * Stale snapshot — Red (before): a period write rebuilt `processor` from an old copy and wiped `processor.id`.
 *                  Green (after): the period merges into `processor`, keeping the id.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { storeRevenueCatPeriod } from "@/external/revenueCat/utils/revenueCatPeriod";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
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
} from "./utils/revenuecatPeriodTestUtils";

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

test.concurrent(
	`${chalk.yellowBright("rc period: a stale RENEWAL redelivered after a newer one does not move the period backward")}`,
	async () => {
		const customerId = "rc-period-stale-cus";
		const RC_STORE_ID = "com.app.rc_period_stale_pro";
		const periodOneStartMs = Date.now() - 61 * DAY_MS;
		const periodTwoStartMs = periodOneStartMs + 30 * DAY_MS;
		const periodThreeStartMs = periodTwoStartMs + 30 * DAY_MS;
		const periodThreeEndMs = periodThreeStartMs + 30 * DAY_MS;

		const { autumnV2_2, proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-stale-pro",
			storeId: RC_STORE_ID,
		});

		const client = newRcClient();
		const renewal = ({ startMs, txId }: { startMs: number; txId: string }) =>
			client.renewal({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_stale_tx_001",
				transactionId: txId,
				purchasedAtMs: startMs,
				expirationAtMs: startMs + 30 * DAY_MS,
			});

		expectWebhookSuccess(
			await client.initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_stale_tx_001",
				purchasedAtMs: periodOneStartMs,
				expirationAtMs: periodTwoStartMs,
			}),
		);
		expectWebhookSuccess(
			await renewal({
				startMs: periodThreeStartMs,
				txId: "rc_period_stale_tx_003",
			}),
		);
		expectWebhookSuccess(
			await renewal({
				startMs: periodTwoStartMs,
				txId: "rc_period_stale_tx_002",
			}),
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const subscription = customer.subscriptions.find(
			(sub) => sub.plan_id === proMonthly.id,
		);
		expect(subscription?.current_period_start).toBe(periodThreeStartMs);
		expect(subscription?.current_period_end).toBe(periodThreeEndMs);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc period: a period write from a stale snapshot keeps a processor id merged after the snapshot")}`,
	async () => {
		const customerId = "rc-period-snapshot-cus";
		const RC_STORE_ID = "com.app.rc_period_snapshot_pro";
		const SUB_ID = "sub_rc_period_snapshot_001";
		const purchasedAtMs = Date.now() - DAY_MS;
		const expirationAtMs = purchasedAtMs + 30 * DAY_MS;

		const { proMonthly } = await setupRcProduct({
			customerId,
			productId: "rc-period-snapshot-pro",
			storeId: RC_STORE_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_period_snapshot_tx_001",
			}),
		);

		const snapshot = await pollUntil(
			() => getRcCusProduct({ customerId, autumnProductId: proMonthly.id }),
			(cp) => Boolean(cp),
		);
		expect(snapshot?.processor?.id).toBeFalsy();

		// The background id lookup lands after the snapshot was read.
		await customerProductRepo.mergeProcessor({
			db: ctx.db,
			cusProductId: snapshot!.id,
			processor: { id: SUB_ID },
		});

		await storeRevenueCatPeriod({
			ctx,
			customerProduct: snapshot!,
			customerId,
			event: {
				purchased_at_ms: purchasedAtMs,
				expiration_at_ms: expirationAtMs,
			},
		});

		const after = await getRcCusProduct({
			customerId,
			autumnProductId: proMonthly.id,
		});
		expect(after?.processor?.id).toBe(SUB_ID);
		expect(after?.processor?.current_period_end).toBe(expirationAtMs);
	},
);
