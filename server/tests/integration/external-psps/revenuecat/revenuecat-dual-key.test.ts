/**
 * Phase 1 — RevenueCat dual-key customer matching + self-migration + auto-create.
 *
 * Verifies the resolver matches a customer by `processors.revenuecat.id` OR by
 * `customer_id` (first wins), lazily backfills the processors key on legacy
 * customers (write app_user_id only, only-if-absent, never original), and
 * auto-creates an email-`app_user_id` customer with a non-email id.
 *
 * Additive-only: a customer with no `processors.revenuecat` must resolve exactly
 * as today (customer_id fallback), and the getCusProcessors response invariant
 * (presence gated on an ACTIVE RC product, never on the DB column) must hold.
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
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_dualkey";

const rcProMonthly = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
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

const seedProcessorsRevenueCatId = async ({
	customerId,
	revenueCatId,
}: {
	customerId: string;
	revenueCatId: string;
}) => {
	await ctx.db
		.update(customers)
		.set({ processors: { revenuecat: { id: revenueCatId } } })
		.where(eq(customers.id, customerId));
};

const getCustomerByCustomerId = async (customerId: string) =>
	ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});

const activeRcProductIds = async (internalCustomerId: string) => {
	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	return cusProducts.map((cp) => cp.product.id);
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

// ═══════════════════════════════════════════════════════════════════
// TEST 1: Dual-key — resolves by processors.revenuecat.id (id ≠ customer_id)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: resolves customer by processors.revenuecat.id when it differs from customer_id")}`,
	async () => {
		const customerId = "rc-dualkey-cus";
		const appUserId = "rc-dualkey-appuser";
		const RC_PRODUCT_ID = "com.app.rc_dualkey_pro";
		const proMonthly = rcProMonthly({ id: "rc-dualkey-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: appUserId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});
		await seedProcessorsRevenueCatId({ customerId, revenueCatId: appUserId });

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId,
				originalTransactionId: "rc_dualkey_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();

		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		// No new customer was created under the app_user_id.
		const strayCustomer = await getCustomerByCustomerId(appUserId);
		expect(strayCustomer).toBeUndefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Backward-compat — app_user_id == customer_id, no processors key
// (already GREEN — proves the change is additive)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: falls back to customer_id when no processors key (backward compat)")}`,
	async () => {
		const customerId = "rc-dualkey-compat";
		const RC_PRODUCT_ID = "com.app.rc_dualkey_compat_pro";
		const proMonthly = rcProMonthly({ id: "rc-dualkey-compat-pro" });

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
			revenuecatProductId: RC_PRODUCT_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: customerId,
				originalTransactionId: "rc_dualkey_compat_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Anon→alias — match via original_app_user_id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: matches seeded anon id via original_app_user_id after alias")}`,
	async () => {
		const customerId = "rc-alias-cus";
		const anonId = "rc-alias-anon";
		const realId = "rc-alias-real";
		const RC_PRODUCT_ID = "com.app.rc_alias_pro";
		const proMonthly = rcProMonthly({ id: "rc-alias-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: anonId }),
				s.deleteCustomer({ customerId: realId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});
		// Customer was first seen anonymous; processors key holds the anon id.
		await seedProcessorsRevenueCatId({ customerId, revenueCatId: anonId });

		// Post-alias webhook: current id is real, original (stable) is anon.
		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: realId,
				originalAppUserId: anonId,
				originalTransactionId: "rc_alias_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		// The processors key is NEVER updated to the aliased/current id.
		const after = await getCustomerByCustomerId(customerId);
		expect(after?.processors?.revenuecat?.id).toBe(anonId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Lazy backfill — seed processors key on legacy customer,
// second webhook does NOT clobber, original id never written.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: lazily backfills processors.revenuecat.id (only-if-absent, no clobber)")}`,
	async () => {
		const customerId = "rc-backfill-cus";
		const RC_PRODUCT_ID = "com.app.rc_backfill_pro";
		const proMonthly = rcProMonthly({ id: "rc-backfill-pro" });

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
			revenuecatProductId: RC_PRODUCT_ID,
		});

		// Legacy customer: no processors key at all.
		const before = await getCustomerByCustomerId(customerId);
		expect(before?.processors?.revenuecat).toBeUndefined();

		// First webhook resolves via customer_id fallback and backfills app_user_id.
		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: customerId,
				originalTransactionId: "rc_backfill_tx_001",
			}),
		);

		const afterFirst = await pollUntil(
			() => getCustomerByCustomerId(customerId),
			(c) => c?.processors?.revenuecat?.id === customerId,
		);
		expect(afterFirst?.processors?.revenuecat?.id).toBe(customerId);

		// Second webhook: aliased so current id differs, original == seeded id.
		// Must NOT clobber the already-present processors key.
		expectWebhookSuccess(
			await newRcClient().renewal({
				productId: RC_PRODUCT_ID,
				appUserId: "rc-backfill-aliased",
				originalAppUserId: customerId,
				originalTransactionId: "rc_backfill_tx_001",
			}),
		);

		// Give any (incorrect) write a chance to land, then assert it did not.
		await new Promise((r) => setTimeout(r, 1500));
		const afterSecond = await getCustomerByCustomerId(customerId);
		expect(afterSecond?.processors?.revenuecat?.id).toBe(customerId);
		expect(afterSecond?.processors?.revenuecat?.id).not.toBe(
			"rc-backfill-aliased",
		);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Email-as-id auto-create — creates non-email id, email set,
// processors.revenuecat.id = the email.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: auto-creates email app_user_id with non-email customer id")}`,
	async () => {
		const email = "rc-email-user@example.com";
		const RC_PRODUCT_ID = "com.app.rc_email_pro";
		const proMonthly = rcProMonthly({ id: "rc-email-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId: "rc-email-anchor",
			setup: [
				s.deleteCustomer({ customerId: "rc-email-anchor" }),
				s.deleteCustomer({ customerId: email }),
				s.deleteCustomer({ email }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: email,
				originalTransactionId: "rc_email_tx_001",
			}),
		);

		const created = await pollUntil(
			() =>
				ctx.db.query.customers.findFirst({
					where: eq(customers.email, email),
				}),
			(c) => Boolean(c?.processors?.revenuecat?.id),
		);

		expect(created).toBeTruthy();
		// Email must NOT become the Autumn customer id.
		expect(created?.id).not.toBe(email);
		expect(created?.email).toBe(email);
		expect(created?.processors?.revenuecat?.id).toBe(email);

		const productIds = await activeRcProductIds(created!.internal_id);
		expect(productIds).toContain(proMonthly.id);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 6: getCusProcessors invariant — DB column set but no ACTIVE RC
// product ⇒ response omits processors.revenuecat.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc dual-key: getCusProcessors omits revenuecat when no active RC product (invariant)")}`,
	async () => {
		const customerId = "rc-invariant-cus";
		const proMonthly = rcProMonthly({ id: "rc-invariant-pro" });

		await setupRevenueCatOrg();

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		// DB column is set, but the customer has no active RC customer_product.
		await seedProcessorsRevenueCatId({
			customerId,
			revenueCatId: "rc-invariant-appuser",
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.processors?.revenuecat).toBeUndefined();
	},
);
