/**
 * Phase 4 — DFU flash RevenueCat hydration. Mirrors the Stripe hydrate: for a
 * `dfu.flash` RevenueCat billable, read the customer's RC subscriptions/purchases
 * (mock-only, via `x-mock-revenuecat` + `x-mock-revenuecat-fixtures` headers) and
 * fill omitted status/timestamp fields. IDs/status/timestamps ONLY — never
 * balances. Read-only. Payload always wins.
 *
 * Contract under test:
 *   1. RC billable, payload OMITS status → status hydrated from the mock RC
 *      subscription. Mock `status:"expired"` → imported cusProduct Expired with
 *      NO feature access (the leak-safe assertion).
 *   2. Payload precedence: explicit payload status differs from the mock sub →
 *      payload wins (active despite an expired mock sub).
 *   3. One-off RC purchase → hydrates id + start only (processor.id + starts_at),
 *      no status inference.
 *   4. `processors.revenuecat.id` is seeded on the customer after flash.
 *
 * The RC read client is served entirely from mock fixtures via testOptions, so
 * these tests NEVER touch api.revenuecat.com.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
	customers,
	type DfuFlashResult,
	type FullCusProduct,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import { CusService } from "@/internal/customers/CusService.js";

type RevenueCatMockFixtures = {
	subscriptions?: unknown[];
	purchases?: unknown[];
	products?: unknown[];
};

type FlashClient = {
	post: (
		path: string,
		body: unknown,
		headers?: Record<string, string>,
	) => Promise<unknown>;
};

const callFlash = async (
	client: FlashClient,
	body: unknown,
	mock?: RevenueCatMockFixtures,
): Promise<{
	result: DfuFlashResult | null;
	errorCode: string | null;
	errorMessage: string | null;
}> => {
	const headers = mock
		? {
				"x-mock-revenuecat": "true",
				"x-mock-revenuecat-fixtures": JSON.stringify(mock),
			}
		: undefined;
	try {
		const result = (await client.post(
			"/dfu.flash",
			body,
			headers,
		)) as DfuFlashResult;
		return { result, errorCode: null, errorMessage: null };
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return {
			result: null,
			errorCode: e.code ?? null,
			errorMessage: e.message ?? null,
		};
	}
};

const getFlashedCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		],
		withEntities: true,
	});
	return fullCustomer.customer_products.find(
		(product) => product.product_id === productId,
	);
};

const now = Date.now();
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

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
	autoRenewalStatus = "will_renew",
	startsAt = now,
	periodEndsAt = now + THIRTY_DAYS_MS,
}: {
	id: string;
	internalProductId: string;
	status?: string;
	autoRenewalStatus?: string;
	startsAt?: number;
	periodEndsAt?: number;
}) => ({
	object: "subscription",
	id,
	product_id: internalProductId,
	store: "app_store",
	store_subscription_identifier: `store_${id}`,
	status,
	starts_at: startsAt,
	current_period_starts_at: startsAt,
	current_period_ends_at: periodEndsAt,
	auto_renewal_status: autoRenewalStatus,
	gives_access: status === "active" || status === "trialing",
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

const rcSubscriptionProduct = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

const rcOneOffProduct = ({ id }: { id: string }) =>
	products.base({
		id,
		isAddOn: true,
		items: [items.oneOffPrice({ price: 20 })],
	});

// ── Contract 1: expired mock sub hydrates status → Expired, no access (leak-safe) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: expired subscription hydrates status=expired and grants no access")}`,
	async () => {
		const customerId = "dfu-flash-rc-expired";
		const appUserId = "rc_app_user_expired";
		const storeId = "com.app.dfu_rc_expired";
		const internalId = "prod_dfu_rc_expired_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-expired-pro" });

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: pro.id,
				revenuecat_product_ids: [storeId],
			},
		});

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_expired",
					internalProductId: internalId,
					status: "expired",
					periodEndsAt: now - THIRTY_DAYS_MS,
				}),
			],
			purchases: [],
		};

		const payload = {
			customer_id: customerId,
			processors: [{ type: "revenuecat", id: appUserId }],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							// status OMITTED — must be hydrated from the RC sub.
							plans: [{ plan_id: pro.id }],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload, mock);

		// Contract 1a: reported status hydrated to expired.
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.status).toBe("expired");

		// Contract 1b: cusProduct is Expired.
		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Expired);

		// Contract 1c: leak-safe — no feature access.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);

// ── Contract 2: explicit payload status wins over the mock sub status ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: payload status wins over hydrated RC subscription status")}`,
	async () => {
		const customerId = "dfu-flash-rc-precedence";
		const appUserId = "rc_app_user_precedence";
		const storeId = "com.app.dfu_rc_precedence";
		const internalId = "prod_dfu_rc_precedence_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-precedence-pro" });

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: pro.id,
				revenuecat_product_ids: [storeId],
			},
		});

		// Mock sub is expired; payload says active → payload must win.
		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_precedence",
					internalProductId: internalId,
					status: "expired",
					periodEndsAt: now - THIRTY_DAYS_MS,
				}),
			],
			purchases: [],
		};

		const payload = {
			customer_id: customerId,
			processors: [{ type: "revenuecat", id: appUserId }],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload, mock);

		// Payload active wins despite the hydrated Expired.
		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Active);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(100);
	},
);

// ── Contract 3: one-off purchase hydrates id + start only ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: one-off purchase hydrates processor id and starts_at only")}`,
	async () => {
		const customerId = "dfu-flash-rc-oneoff";
		const appUserId = "rc_app_user_oneoff";
		const storeId = "com.app.dfu_rc_oneoff";
		const internalId = "prod_dfu_rc_oneoff_internal";
		const purchaseId = "purchase_dfu_rc_oneoff";
		const purchasedAt = now - THIRTY_DAYS_MS;
		const oneOff = rcOneOffProduct({ id: "dfu-rc-oneoff-pack" });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [oneOff] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: oneOff.id,
				revenuecat_product_ids: [storeId],
			},
		});

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId, type: "one_time" })],
			subscriptions: [],
			purchases: [
				mockPurchase({
					id: purchaseId,
					internalProductId: internalId,
					purchasedAt,
				}),
			],
		};

		const payload = {
			customer_id: customerId,
			processors: [{ type: "revenuecat", id: appUserId }],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: oneOff.id }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload, mock);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: oneOff.id,
		});
		// Purchase hydrates only id + start; status stays the default active.
		expect(cusProduct?.processor?.id).toBe(purchaseId);
		expect(cusProduct?.starts_at).toBe(purchasedAt);
		expect(cusProduct?.status).toBe(CusProductStatus.Active);
	},
);

// ── Contract 4: processors.revenuecat.id seeded on the customer after flash ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: seeds processors.revenuecat.id on the customer")}`,
	async () => {
		const customerId = "dfu-flash-rc-seed";
		const appUserId = "rc_app_user_seed_email@example.com";
		const storeId = "com.app.dfu_rc_seed";
		const internalId = "prod_dfu_rc_seed_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-seed-pro" });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: pro.id,
				revenuecat_product_ids: [storeId],
			},
		});

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_seed",
					internalProductId: internalId,
					status: "active",
				}),
			],
			purchases: [],
		};

		const payload = {
			customer_id: customerId,
			processors: [{ type: "revenuecat", id: appUserId }],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload, mock);

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer?.processors?.revenuecat?.id).toBe(appUserId);
	},
);
