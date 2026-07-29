/**
 * Phase 3 — persist the RevenueCat subscription/purchase id on
 * `cusProduct.processor.id` when an RC product is inserted.
 *
 * The server-side RC read client is served from mock fixtures via
 * `testOptions.revenueCat` (sent as a request header by the webhook client),
 * so these tests NEVER touch api.revenuecat.com. The id-store is best-effort:
 * a no-match / failure must still insert the product with no processor.id and
 * surface no error.
 */

import { expect, test } from "bun:test";
import { AppEnv, CusProductStatus, customers } from "@autumn/shared";
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

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_procid";

const rcProMonthly = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

const rcOneOff = ({ id }: { id: string }) =>
	products.base({
		id,
		isAddOn: true,
		items: [items.oneOffPrice({ price: 20 })],
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

const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

const mapProduct = async ({
	autumnProductId,
	revenuecatProductId,
}: {
	autumnProductId: string;
	revenuecatProductId: string;
}) => {
	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: autumnProductId,
			revenuecat_product_ids: [revenuecatProductId],
		},
	});
};

const getCustomerByCustomerId = async (customerId: string) =>
	ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});

const rcCusProduct = async ({
	internalCustomerId,
	autumnProductId,
}: {
	internalCustomerId: string;
	autumnProductId: string;
}) => {
	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
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

const now = Date.now();

const mockProduct = ({
	internalId,
	storeId,
	type = "subscription",
}: {
	internalId: string;
	storeId: string;
	type?: "subscription" | "one_time";
}) => ({
	object: "product",
	id: internalId,
	store_identifier: storeId,
	type,
	created_at: now,
	app_id: "app_mock",
	display_name: storeId,
});

const mockSubscription = ({
	id,
	internalProductId,
	status = "active",
	startsAt = now,
}: {
	id: string;
	internalProductId: string;
	status?: string;
	startsAt?: number;
}) => ({
	object: "subscription",
	id,
	product_id: internalProductId,
	store: "app_store",
	store_subscription_identifier: `store_${id}`,
	status,
	starts_at: startsAt,
	current_period_starts_at: startsAt,
	current_period_ends_at: startsAt + 1000 * 60 * 60 * 24 * 30,
	auto_renewal_status: "will_renew",
	gives_access: true,
});

const mockPurchase = ({
	id,
	internalProductId,
	purchasedAt = now,
}: {
	id: string;
	internalProductId: string;
	purchasedAt?: number;
}) => ({
	object: "purchase",
	id,
	product_id: internalProductId,
	store: "app_store",
	purchased_at: purchasedAt,
	status: "owned",
});

// ═══════════════════════════════════════════════════════════════════
// TEST 1: INITIAL_PURCHASE subscription → processor.id == mock sub id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc processor-id: stores subscription id on cusProduct.processor.id after INITIAL_PURCHASE")}`,
	async () => {
		const customerId = "rc-procid-sub-cus";
		const RC_STORE_ID = "com.app.rc_procid_sub_pro";
		const RC_INTERNAL_ID = "prod_rc_internal_sub_1";
		const SUB_ID = "sub_rc_procid_001";
		const proMonthly = rcProMonthly({ id: "rc-procid-sub-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_STORE_ID,
		});

		const mock: RevenueCatMockFixtures = {
			products: [
				mockProduct({ internalId: RC_INTERNAL_ID, storeId: RC_STORE_ID }),
			],
			subscriptions: [
				mockSubscription({ id: SUB_ID, internalProductId: RC_INTERNAL_ID }),
			],
			purchases: [],
		};

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_procid_sub_tx_001",
				mock,
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();

		const cusProduct = await pollUntil(
			() =>
				rcCusProduct({
					internalCustomerId: dbCustomer!.internal_id,
					autumnProductId: proMonthly.id,
				}),
			(cp) => Boolean(cp?.processor?.id),
		);

		expect(cusProduct).toBeTruthy();
		expect(cusProduct?.processor?.id).toBe(SUB_ID);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: NON_RENEWING_PURCHASE one-off → processor.id == mock purchase id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc processor-id: stores purchase id on cusProduct.processor.id after NON_RENEWING_PURCHASE")}`,
	async () => {
		const customerId = "rc-procid-oneoff-cus";
		const RC_STORE_ID = "com.app.rc_procid_oneoff_pack";
		const RC_INTERNAL_ID = "prod_rc_internal_oneoff_1";
		const PURCHASE_ID = "purchase_rc_procid_001";
		const oneOff = rcOneOff({ id: "rc-procid-oneoff-pack" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: oneOff.id,
			revenuecatProductId: RC_STORE_ID,
		});

		const mock: RevenueCatMockFixtures = {
			products: [
				mockProduct({
					internalId: RC_INTERNAL_ID,
					storeId: RC_STORE_ID,
					type: "one_time",
				}),
			],
			subscriptions: [],
			purchases: [
				mockPurchase({ id: PURCHASE_ID, internalProductId: RC_INTERNAL_ID }),
			],
		};

		expectWebhookSuccess(
			await newRcClient().nonRenewingPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_procid_oneoff_tx_001",
				mock,
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();

		const cusProduct = await pollUntil(
			() =>
				rcCusProduct({
					internalCustomerId: dbCustomer!.internal_id,
					autumnProductId: oneOff.id,
				}),
			(cp) => Boolean(cp?.processor?.id),
		);

		expect(cusProduct).toBeTruthy();
		expect(cusProduct?.processor?.id).toBe(PURCHASE_ID);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Best-effort — no matching RC item ⇒ product inserted,
// processor.id absent, no error surfaced.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc processor-id: best-effort — no matching RC item still inserts product without processor.id")}`,
	async () => {
		const customerId = "rc-procid-nomatch-cus";
		const RC_STORE_ID = "com.app.rc_procid_nomatch_pro";
		const RC_INTERNAL_ID = "prod_rc_internal_nomatch_1";
		const proMonthly = rcProMonthly({ id: "rc-procid-nomatch-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_STORE_ID,
		});

		// Subscription references an RC-internal product id that is NOT in the
		// catalog fixture, so it maps to no Autumn product → no match.
		const mock: RevenueCatMockFixtures = {
			products: [
				mockProduct({ internalId: RC_INTERNAL_ID, storeId: RC_STORE_ID }),
			],
			subscriptions: [
				mockSubscription({
					id: "sub_rc_procid_nomatch_001",
					internalProductId: "prod_rc_internal_unknown",
				}),
			],
			purchases: [],
		};

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_STORE_ID,
				appUserId: customerId,
				originalTransactionId: "rc_procid_nomatch_tx_001",
				mock,
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();

		// Product is inserted (the point of the flow); wait for it.
		const cusProduct = await pollUntil(
			() =>
				rcCusProduct({
					internalCustomerId: dbCustomer!.internal_id,
					autumnProductId: proMonthly.id,
				}),
			(cp) => Boolean(cp),
		);
		expect(cusProduct).toBeTruthy();

		// Give any (incorrect) best-effort write a chance to land, then assert absent.
		await new Promise((r) => setTimeout(r, 1500));
		const after = await rcCusProduct({
			internalCustomerId: dbCustomer!.internal_id,
			autumnProductId: proMonthly.id,
		});
		expect(after?.processor?.id ?? null).toBeNull();
	},
);
