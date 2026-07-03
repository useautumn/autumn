/**
 * RevenueCat `autumn_customer_id` subscriber-attribute override.
 *
 * The client sets `app_user_id = email` in RevenueCat but declares the canonical
 * Autumn customer id via a subscriber attribute `autumn_customer_id`. The resolver
 * must treat that attribute as THE customer id — highest priority, short-circuiting
 * the app_user_id / customer_id chain. Missing target ⇒ auto-create with that id;
 * the webhook's app_user_id is still seeded into processors.revenuecat as an alias.
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
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_override";
const OVERRIDE_KEY = "autumn_customer_id";

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
	aliases = [],
}: {
	customerId: string;
	revenueCatId: string;
	aliases?: string[];
}) => {
	await ctx.db
		.update(customers)
		.set({ processors: { revenuecat: { id: revenueCatId, aliases } } })
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
// TEST 1: Override target does NOT exist ⇒ auto-create it, plan lands
// on it, NO email-keyed customer, processors.revenuecat.id = the email.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc override: auto-creates the override id, seeds email as alias, no email customer")}`,
	async () => {
		const overrideId = "org_rc_override_new";
		const email = "rc-override-new@example.com";
		const RC_PRODUCT_ID = "com.app.rc_override_new_pro";
		const proMonthly = rcProMonthly({ id: "rc-override-new-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId: "rc-override-new-anchor",
			setup: [
				s.deleteCustomer({ customerId: "rc-override-new-anchor" }),
				s.deleteCustomer({ customerId: overrideId }),
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
				originalTransactionId: "rc_override_new_tx_001",
				subscriberAttributes: { [OVERRIDE_KEY]: overrideId },
			}),
		);

		const created = await pollUntil(
			() => getCustomerByCustomerId(overrideId),
			(c) => Boolean(c),
		);
		expect(created).toBeTruthy();
		expect(created?.id).toBe(overrideId);

		const productIds = await pollUntil(
			() => activeRcProductIds(created!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		// The email must NOT become an Autumn customer; it rides as an RC alias.
		const emailCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.email, email),
		});
		expect(emailCustomer).toBeUndefined();
		const emailIdCustomer = await getCustomerByCustomerId(email);
		expect(emailIdCustomer).toBeUndefined();

		expect(created?.processors?.revenuecat?.id).toBe(email);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Override target ALREADY exists ⇒ plan lands on it, override
// beats the email.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc override: existing override customer receives the plan (override beats email)")}`,
	async () => {
		const overrideId = "org_rc_override_existing";
		const email = "rc-override-existing@example.com";
		const RC_PRODUCT_ID = "com.app.rc_override_existing_pro";
		const proMonthly = rcProMonthly({ id: "rc-override-existing-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId: overrideId,
			setup: [
				s.deleteCustomer({ customerId: overrideId }),
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
				originalTransactionId: "rc_override_existing_tx_001",
				subscriberAttributes: { [OVERRIDE_KEY]: overrideId },
			}),
		);

		const existing = await getCustomerByCustomerId(overrideId);
		expect(existing).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(existing!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		// No email customer created; email seeded as the RC alias on the override.
		const emailCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.email, email),
		});
		expect(emailCustomer).toBeUndefined();
		const after = await pollUntil(
			() => getCustomerByCustomerId(overrideId),
			(c) => c?.processors?.revenuecat?.id === email,
		);
		expect(after?.processors?.revenuecat?.id).toBe(email);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 3: A different customer matches by app_user_id, but the override
// wins — the client's explicit declaration beats the guess.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc override: override wins even when a different customer matches by app_user_id")}`,
	async () => {
		const overrideId = "org_rc_override_wins";
		const appUserId = "rc-override-appuser-match";
		const RC_PRODUCT_ID = "com.app.rc_override_wins_pro";
		const proMonthly = rcProMonthly({ id: "rc-override-wins-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId: appUserId,
			setup: [
				s.deleteCustomer({ customerId: overrideId }),
				s.deleteCustomer({ customerId: appUserId }),
				// Customer that WOULD match by customer_id == app_user_id.
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		// Pre-create the override target so we can assert the plan lands here.
		await initScenario({
			customerId: overrideId,
			setup: [s.customer({ testClock: false, skipWebhooks: true })],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId,
				originalTransactionId: "rc_override_wins_tx_001",
				subscriberAttributes: { [OVERRIDE_KEY]: overrideId },
			}),
		);

		const overrideCustomer = await getCustomerByCustomerId(overrideId);
		const overrideProductIds = await pollUntil(
			() => activeRcProductIds(overrideCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(overrideProductIds).toContain(proMonthly.id);

		// The app_user_id-matched customer must NOT receive the plan.
		const appUserCustomer = await getCustomerByCustomerId(appUserId);
		const appUserProductIds = await activeRcProductIds(
			appUserCustomer!.internal_id,
		);
		expect(appUserProductIds).not.toContain(proMonthly.id);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 4: No override attribute ⇒ existing customer_id behavior unchanged.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("rc override: no override attribute preserves existing app_user_id resolution")}`,
	async () => {
		const customerId = "rc-override-none";
		const RC_PRODUCT_ID = "com.app.rc_override_none_pro";
		const proMonthly = rcProMonthly({ id: "rc-override-none-pro" });

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
				originalTransactionId: "rc_override_none_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);
		expect(dbCustomer?.processors?.revenuecat?.id).toBe(customerId);
	},
);
