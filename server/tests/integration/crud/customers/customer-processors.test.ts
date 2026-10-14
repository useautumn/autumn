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
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";

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
		updated_at: Date.now(),
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

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.processor?.id).toBe(cached.processors!.stripe!.id);
	expect(fromDb.processor?.id).toMatch(/^cus_/);
});

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

test.concurrent(`${chalk.yellowBright("customer processors: active RevenueCat cusProduct surfaces revenuecat.id = customer.id")}`, async () => {
	const customerId = "customer-processors-rc-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-active-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
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
	expect(cached.processors?.vercel).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.processors?.revenuecat).toEqual({ id: customerId });

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const rcRows = (fromDb.customer_products ?? []).filter(
		(cp) =>
			cp.processor?.type === ProcessorType.RevenueCat &&
			cp.status === CusProductStatus.Active,
	);
	expect(rcRows.length).toBeGreaterThan(0);
});

test.concurrent(`${chalk.yellowBright("customer processors: expired-only RevenueCat cusProduct does NOT surface revenuecat")}`, async () => {
	const customerId = "customer-processors-rc-expired";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-expired-pro", items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id,
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

test.concurrent(`${chalk.yellowBright("customer processors: anonymous customer with active RC cusProduct surfaces revenuecat.id = null")}`, async () => {
	const email = "customer-processors-rc-anon@example.com";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "rc-anon-pro", items: [messagesItem] });

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
		id: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await seedCusProduct({
		ctx,
		internalCustomerId,
		internalProductId: product!.internal_id,
		productId: product!.id,
		customerId: null,
		status: CusProductStatus.Active,
		processorType: ProcessorType.RevenueCat,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId: internalCustomerId,
		source: "test:rc-anon-seed",
	});

	const cached =
		await autumnV2_1.customers.get<ApiCustomerV5>(internalCustomerId);
	expect(cached.processors?.revenuecat).toEqual({ id: null });

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(
		internalCustomerId,
		{ skip_cache: "true" },
	);
	expect(uncached.processors?.revenuecat).toEqual({ id: null });
});

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
		actions: [s.attach({ productId: pro.id })],
	});

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

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id,
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

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id,
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

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(before.processors?.stripe?.id).toMatch(/^cus_/);
	expect(before.processors?.vercel?.installation_id).toBe("icfg_partial_xxx");
	expect(before.processors?.revenuecat).toEqual({ id: customerId });

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

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const product = await ProductService.get({
		db: ctx.db,
		id: pro.id,
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

	expect(v3.stripe_id).toMatch(/^cus_/);
});
