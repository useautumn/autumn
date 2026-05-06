import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	ApiVersion,
	BillingVersion,
	CollectionMethod,
	type CusProduct,
	CusProductStatus,
	customerProducts,
	ProcessorType,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER PROCESSORS — V5 API `processors` field
//
// Contract under test (locked):
//   ApiCustomerV5.processors: optional object, three optional sub-keys:
//     stripe?:     { id: string }
//     vercel?:     { installation_id: string, account_id: string }
//     revenuecat?: { id: string | null }
//
// Behaviors:
//   - no signals (no customer.processor.id, no customer.processors.vercel,
//     no active RC cusProduct) ⇒ processors === undefined (key omitted entirely)
//   - stripe.id present                ⇒ { stripe: { id } }
//   - customer.processors.vercel set   ⇒ { vercel: { installation_id, account_id } }
//                                        NEVER includes access_token or
//                                        custom_payment_method_id
//   - ≥1 ACTIVE RC cusProduct          ⇒ { revenuecat: { id: customer.id ?? null } }
//                                        Inactive-only RC products do NOT trigger.
//   - multi-PSP                        ⇒ all applicable keys present together
//   - earlier API versions             ⇒ no `processors` key at all
//
// Round-trips: cached read == uncached read (skip_cache='true') == derived-from-DB
// read. Side effects: none.
//
// Mirrors the customer-config.test.ts triad pattern (cached → uncached → DB read).
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Direct DB seed for a customer-product row. Used to simulate processor-typed
 * customer products (RevenueCat-managed subscriptions) that aren't reachable
 * via the public attach flow.
 */
const seedCusProduct = async ({
	ctx,
	internalCustomerId,
	internalProductId,
	productId,
	customerId,
	status,
	processorType,
}: {
	ctx: TestContext;
	internalCustomerId: string;
	internalProductId: string;
	productId: string;
	customerId: string | null;
	status: CusProductStatus;
	processorType: ProcessorType;
}) => {
	const cusProduct: CusProduct = {
		id: generateId("cus_prod"),
		internal_customer_id: internalCustomerId,
		internal_product_id: internalProductId,
		product_id: productId,
		customer_id: customerId,
		internal_entity_id: null,
		entity_id: null,
		created_at: Date.now(),
		status,
		canceled: false,
		starts_at: Date.now(),
		trial_ends_at: null,
		billing_cycle_anchor_resets_at: null,
		canceled_at: null,
		ended_at: null,
		options: [],
		free_trial_id: null,
		collection_method: CollectionMethod.ChargeAutomatically,
		subscription_ids: [],
		scheduled_ids: null,
		processor: { type: processorType },
		quantity: 1,
		api_semver: ApiVersion.V2_2,
		is_custom: false,
		billing_version: BillingVersion.V2,
		external_id: null,
		stripe_checkout_session_id: null,
	};

	await ctx.db.insert(customerProducts).values(cusProduct as any);
	return cusProduct;
};

// ── Tests ──────────────────────────────────────────────────────────────────────

// 1. No-signal customer — `processors` key must be omitted entirely.
test.concurrent(`${chalk.yellowBright("customer processors: no-signal customer omits the processors key entirely")}`, async () => {
	const customerId = "customer-processors-no-signal";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "No Signal",
		email: `${customerId}@example.com`,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors).toBeUndefined();

	// DB read — customer.processor falsy, customer.processors empty/falsy,
	// no customer_products. The response-side assertion above is the contract;
	// this DB read is the round-trip proof.
	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.processor).toBeFalsy();
	const dbProcessors = fromDb.processors as
		| { vercel?: unknown; revenuecat?: unknown }
		| null
		| undefined;
	expect(dbProcessors?.vercel).toBeUndefined();
	expect(dbProcessors?.revenuecat).toBeUndefined();
	expect(fromDb.customer_products?.length ?? 0).toBe(0);
});

// 2. Stripe-only — attaching a paid product creates a Stripe customer.
test.concurrent(`${chalk.yellowBright("customer processors: stripe-only customer surfaces only stripe.id")}`, async () => {
	const customerId = "customer-processors-stripe-only";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "stripe-only-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors).toBeDefined();
	expect(cached.processors?.stripe).toBeDefined();
	expect(cached.processors?.stripe?.id).toMatch(/^cus_/);
	expect(cached.processors?.vercel).toBeUndefined();
	expect(cached.processors?.revenuecat).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.stripe?.id).toBe(cached.processors!.stripe!.id);
	expect(uncached.processors?.vercel).toBeUndefined();
	expect(uncached.processors?.revenuecat).toBeUndefined();

	// DB read — customer.processor.id is the Stripe ID we just surfaced.
	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.processor?.id).toBe(cached.processors!.stripe!.id);
	expect(fromDb.processor?.id).toMatch(/^cus_/);
});

// 3. Vercel customer — seed via direct DB write, response strips secrets.
test.concurrent(`${chalk.yellowBright("customer processors: vercel customer exposes only public-safe subset, never access_token or custom_payment_method_id")}`, async () => {
	const customerId = "customer-processors-vercel";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Vercel Customer",
		email: `${customerId}@example.com`,
	});

	// Seed processors.vercel directly. The full DB shape includes secrets
	// (access_token + custom_payment_method_id) — the response layer must
	// strip these.
	await CusService.update({
		ctx,
		idOrInternalId: customerId,
		update: {
			processors: {
				vercel: {
					installation_id: "icfg_test_xxx",
					access_token: "vci_test_secret_xxx",
					account_id: "acct_test_xxx",
					custom_payment_method_id: "pm_test_xxx",
				},
			},
		},
	});
	// Direct DB write bypasses the refresh-cache middleware. Invalidate
	// manually so the next cached read fetches fresh.
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:customer-processors-vercel-seed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors?.vercel).toEqual({
		installation_id: "icfg_test_xxx",
		account_id: "acct_test_xxx",
	});
	expect((cached.processors?.vercel as any).access_token).toBeUndefined();
	expect(
		(cached.processors?.vercel as any).custom_payment_method_id,
	).toBeUndefined();
	expect(cached.processors?.stripe).toBeUndefined();
	expect(cached.processors?.revenuecat).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.vercel).toEqual({
		installation_id: "icfg_test_xxx",
		account_id: "acct_test_xxx",
	});
	expect((uncached.processors?.vercel as any).access_token).toBeUndefined();
	expect(
		(uncached.processors?.vercel as any).custom_payment_method_id,
	).toBeUndefined();

	// DB read — confirm secrets ARE in the DB. This proves we strip at the
	// response layer, not the DB layer.
	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const dbVercel = fromDb.processors?.vercel as
		| {
				installation_id: string;
				access_token: string;
				account_id: string;
				custom_payment_method_id?: string;
		  }
		| undefined;
	expect(dbVercel?.installation_id).toBe("icfg_test_xxx");
	expect(dbVercel?.access_token).toBe("vci_test_secret_xxx");
	expect(dbVercel?.account_id).toBe("acct_test_xxx");
	expect(dbVercel?.custom_payment_method_id).toBe("pm_test_xxx");
});

// 4a. Active RC cusProduct — seeded directly via DB.
test.concurrent(`${chalk.yellowBright("customer processors: active RevenueCat cusProduct surfaces revenuecat.id = customer.id")}`, async () => {
	const customerId = "customer-processors-rc-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-active-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const customer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	// pro.id is mutated in place by addPrefixToProducts during initScenario,
	// so it already carries the productPrefix suffix here.
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(product).toBeDefined();

	await seedCusProduct({
		ctx,
		internalCustomerId: customer.internal_id,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId,
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:rc-active-seed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors?.revenuecat).toEqual({ id: customerId });
	// stripe may or may not be present depending on whether s.customer({})
	// auto-created a Stripe customer; assert the RC contract independently.
	expect(cached.processors?.vercel).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.revenuecat).toEqual({ id: customerId });

	// DB read — cusProduct present and active, processor.type === 'revenuecat'.
	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const rcRows = (fromDb.customer_products ?? []).filter(
		(cp) =>
			cp.processor?.type === ProcessorType.RevenueCat &&
			cp.status === CusProductStatus.Active,
	);
	expect(rcRows.length).toBeGreaterThan(0);
});

// 4b. Expired-only RC cusProduct — must NOT surface revenuecat.
test.concurrent(`${chalk.yellowBright("customer processors: expired-only RevenueCat cusProduct does NOT surface revenuecat")}`, async () => {
	const customerId = "customer-processors-rc-expired";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-expired-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const customer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id, // mutated to include productPrefix by initScenario
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await seedCusProduct({
		ctx,
		internalCustomerId: customer.internal_id,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId,
		status: CusProductStatus.Expired,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:rc-expired-seed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors?.revenuecat).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.revenuecat).toBeUndefined();
});

// 4c. Anonymous customer (id IS NULL) + active RC cusProduct.
test.concurrent(`${chalk.yellowBright("customer processors: anonymous customer with active RC cusProduct surfaces revenuecat.id = null")}`, async () => {
	const email = "customer-processors-rc-anon@example.com";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-anon-pro", items: [messagesItem] });

	// Use a fixed productPrefix so the prefixed productId is deterministic
	// (no customerId is set in the scenario — null-id customers are made
	// after init via autumnV1.customers.create({ id: null, email })).
	const productPrefix = "customer-processors-rc-anon";

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ email }),
			s.products({ list: [pro], prefix: productPrefix }),
		],
		actions: [],
	});

	const created = await autumnV1.customers.create({
		id: null,
		name: "Anon RC",
		email,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});
	expect(created.id).toBeNull();
	const internalCustomerId = created.autumn_id!;

	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id, // mutated to include productPrefix by initScenario
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await seedCusProduct({
		ctx,
		internalCustomerId,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId: null, // anon customer
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId: internalCustomerId,
		source: "test:rc-anon-seed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(
		internalCustomerId,
	);
	expect(cached.processors?.revenuecat).toEqual({ id: null });
	// id: null contract — must round-trip through ApiCustomerV5Schema cleanly.
	// (Zod parse is exercised implicitly by the response builder; the explicit
	// equality assertion above is sufficient.)

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(
		internalCustomerId,
		{ skip_cache: "true" },
	);
	expect(uncached.processors?.revenuecat).toEqual({ id: null });
});

// 5. Multi-PSP — all three processors present simultaneously.
test.concurrent(`${chalk.yellowBright("customer processors: multi-PSP customer surfaces stripe, vercel, and revenuecat together")}`, async () => {
	const customerId = "customer-processors-multi";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "multi-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })], // creates Stripe customer
	});

	// Vercel seed
	await CusService.update({
		ctx,
		idOrInternalId: customerId,
		update: {
			processors: {
				vercel: {
					installation_id: "icfg_multi_xxx",
					access_token: "vci_multi_secret",
					account_id: "acct_multi_xxx",
				},
			},
		},
	});

	// RevenueCat cusProduct seed
	const customer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id, // mutated to include productPrefix by initScenario
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await seedCusProduct({
		ctx,
		internalCustomerId: customer.internal_id,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId,
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:multi-seed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.processors?.stripe?.id).toMatch(/^cus_/);
	expect(cached.processors?.vercel?.installation_id).toBe("icfg_multi_xxx");
	expect(cached.processors?.vercel?.account_id).toBe("acct_multi_xxx");
	expect(cached.processors?.revenuecat).toEqual({ id: customerId });

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.stripe?.id).toBe(cached.processors!.stripe!.id);
	expect(uncached.processors?.vercel?.installation_id).toBe("icfg_multi_xxx");
	expect(uncached.processors?.revenuecat).toEqual({ id: customerId });
});

// 6. Partial-update non-clobber — updating an unrelated field must not wipe processors.
test.concurrent(`${chalk.yellowBright("customer processors: unrelated update (name) does not clobber stripe / vercel / revenuecat")}`, async () => {
	const customerId = "customer-processors-partial";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "partial-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Seed vercel + RC the same way as test 5 to get all three signals.
	await CusService.update({
		ctx,
		idOrInternalId: customerId,
		update: {
			processors: {
				vercel: {
					installation_id: "icfg_partial_xxx",
					access_token: "vci_partial_secret",
					account_id: "acct_partial_xxx",
				},
			},
		},
	});

	const customer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id, // mutated to include productPrefix by initScenario
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await seedCusProduct({
		ctx,
		internalCustomerId: customer.internal_id,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId,
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:partial-seed",
	});

	// Sanity precondition (uncached because we just wrote directly to DB).
	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(before.processors?.stripe?.id).toMatch(/^cus_/);
	expect(before.processors?.vercel?.installation_id).toBe("icfg_partial_xxx");
	expect(before.processors?.revenuecat).toEqual({ id: customerId });

	// Unrelated update — this hits the API, refresh-cache middleware fires
	// and invalidates the cached customer for us.
	await autumnV2_1.customers.update(customerId, { name: "Renamed" });

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.name).toBe("Renamed");
	expect(cached.processors?.stripe?.id).toMatch(/^cus_/);
	expect(cached.processors?.vercel?.installation_id).toBe("icfg_partial_xxx");
	expect(cached.processors?.vercel?.account_id).toBe("acct_partial_xxx");
	expect(cached.processors?.revenuecat).toEqual({ id: customerId });

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.name).toBe("Renamed");
	expect(uncached.processors?.stripe?.id).toMatch(/^cus_/);
	expect(uncached.processors?.vercel?.installation_id).toBe("icfg_partial_xxx");
	expect(uncached.processors?.revenuecat).toEqual({ id: customerId });
});

// 7. Cross-version response shape — V3 (V1) must NOT include `processors`.
test.concurrent(`${chalk.yellowBright("customer processors: ApiCustomerV3 response (autumnV1) has no processors key")}`, async () => {
	const customerId = "customer-processors-cross-version";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "xver-pro", items: [messagesItem] });

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Layer in vercel + RC so that V5 is fully populated and the contrast is sharp.
	await CusService.update({
		ctx,
		idOrInternalId: customerId,
		update: {
			processors: {
				vercel: {
					installation_id: "icfg_xver_xxx",
					access_token: "vci_xver_secret",
					account_id: "acct_xver_xxx",
				},
			},
		},
	});

	const customer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id, // mutated to include productPrefix by initScenario
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await seedCusProduct({
		ctx,
		internalCustomerId: customer.internal_id,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId,
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test:cross-version-seed",
	});

	const v5 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(v5.processors).toBeDefined();
	expect(v5.processors?.stripe?.id).toMatch(/^cus_/);
	expect(v5.processors?.vercel?.installation_id).toBe("icfg_xver_xxx");
	expect(v5.processors?.revenuecat).toEqual({ id: customerId });

	const v3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect((v3 as any).processors).toBeUndefined();

	// Belt-and-suspenders: a stripe_id exists on V3 so the customer truly does
	// have a Stripe processor; the lack of `processors` is a schema choice,
	// not a missing-data artifact.
	expect(v3.stripe_id).toMatch(/^cus_/);
});
