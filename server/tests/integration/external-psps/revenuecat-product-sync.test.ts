import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	BillingInterval,
	type FullProduct,
	type Price,
	PriceType,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { RevenueCatApp } from "@/external/revenueCat/revenuecatTypes";
import { syncProductToRevenueCat } from "@/external/revenueCat/sync/syncRevenueCatProducts";

const APPS: RevenueCatApp[] = [
	{
		object: "app",
		id: "app_ios",
		name: "iOS",
		type: "app_store",
		project_id: "proj_test",
		created_at: 0,
	},
	{
		object: "app",
		id: "app_android",
		name: "Android",
		type: "play_store",
		project_id: "proj_test",
		created_at: 0,
	},
];

type FetchCall = { method: string; url: string; body: unknown };
let fetchCalls: FetchCall[] = [];
let existingProducts: Array<{
	id: string;
	app_id: string;
	store_identifier: string;
	display_name: string;
}> = [];
let productCounter = 0;
let mcpError = false;
let originalFetch: typeof fetch;

const json = (b: unknown, status = 200) =>
	new Response(JSON.stringify(b), {
		status,
		headers: { "Content-Type": "application/json" },
	});

beforeEach(() => {
	originalFetch = globalThis.fetch;
	fetchCalls = [];
	productCounter = 0;
	mcpError = false;
	existingProducts = [];
	globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
		const url = input?.toString() ?? "";
		const path = url.split("?")[0];
		const method = (init?.method ?? "GET").toUpperCase();
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		fetchCalls.push({ method, url, body });

		if (method === "GET" && path.endsWith("/products")) {
			return json({ object: "list", items: existingProducts, next_page: null });
		}
		if (method === "POST" && path.endsWith("/products")) {
			productCounter += 1;
			return json({ object: "product", id: `prod_${productCounter}` }, 201);
		}
		if (method === "POST" && path.includes("/create_in_store")) {
			return json({ created_product: { id: "1" } }, 201);
		}
		if (path.startsWith("https://mcp.revenuecat.ai")) {
			return json({ result: { isError: mcpError, content: [] } });
		}
		if (method === "POST" && path.includes("/products/")) {
			return json({ object: "product", id: "prod_x" });
		}
		return json({});
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const rcCli = () =>
	initRevenuecatCli({ projectId: "proj_test", accessToken: "tok" });

const price = (interval: BillingInterval, amount = 15): Price =>
	({
		config: { type: PriceType.Fixed, amount, interval, interval_count: 1 },
	}) as unknown as Price;

const buildProduct = (
	id: string,
	name: string,
	group?: string,
	amount = 15,
): FullProduct =>
	({
		id,
		name,
		group: group ?? "",
		prices: [price(BillingInterval.Month, amount)],
		entitlements: [],
		free_trial: null,
	}) as unknown as FullProduct;

const storeId = (planId: string) => `autumn.${ctx.env}.${ctx.org.id}.${planId}`;

const getMappingIds = async (planId: string) => {
	const rows = await RCMappingService.get({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		autumnProductId: planId,
	});
	return rows[0]?.revenuecat_product_ids ?? [];
};

const cleanup = (planId: string) =>
	RCMappingService.delete({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		autumnProductId: planId,
	});

test(`${chalk.yellowBright("rc sync: creates a product per app, unions the minted id, no create_in_store in sandbox")}`, async () => {
	const planId = `rc-sync-create-${Date.now()}`;
	await cleanup(planId);

	const result = await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: APPS,
		isLive: false,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro"),
	});

	const creates = fetchCalls.filter(
		(c) => c.method === "POST" && c.url.split("?")[0].endsWith("/products"),
	);
	expect(creates).toHaveLength(APPS.length);
	for (const c of creates) {
		expect(c.body).toMatchObject({
			store_identifier: storeId(planId),
			type: "subscription",
			display_name: "Pro",
		});
		expect((c.body as { subscription?: unknown }).subscription).toBeUndefined();
	}
	expect(fetchCalls.some((c) => c.url.includes("/create_in_store"))).toBe(
		false,
	);
	expect(
		fetchCalls.some((c) => c.url.startsWith("https://mcp.revenuecat.ai")),
	).toBe(false);

	expect(result.status).toBe("synced");
	expect(await getMappingIds(planId)).toContain(storeId(planId));

	await cleanup(planId);
});

test(`${chalk.yellowBright("rc sync: test_store app gets subscription params on create and no store push")}`, async () => {
	const planId = `rc-sync-teststore-${Date.now()}`;
	await cleanup(planId);

	const testStoreApps: RevenueCatApp[] = [
		{
			object: "app",
			id: "app_test",
			name: "Test Store",
			type: "test_store",
			project_id: "proj_test",
			created_at: 0,
		},
	];

	await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: testStoreApps,
		isLive: true,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro"),
	});

	const create = fetchCalls.find(
		(c) => c.method === "POST" && c.url.split("?")[0].endsWith("/products"),
	);
	expect(create?.body).toMatchObject({
		type: "subscription",
		subscription: { duration: "P1M" },
	});
	expect(fetchCalls.some((c) => c.url.includes("/create_in_store"))).toBe(
		false,
	);

	const priceCall = fetchCalls.find((c) =>
		c.url.startsWith("https://mcp.revenuecat.ai"),
	);
	expect(priceCall).toBeDefined();
	const params = (
		priceCall?.body as { params?: { name?: string; arguments?: any } }
	)?.params;
	expect(params?.name).toBe("create-product-prices");
	expect(params?.arguments).toMatchObject({
		project_id: "proj_test",
		product_id: "prod_1",
		body: { prices: [{ amount_micros: 15_000_000 }] },
	});
	expect(params?.arguments.body.prices[0].currency).toMatch(/^[A-Z]{3}$/);

	await cleanup(planId);
});

test(`${chalk.yellowBright("rc sync: live env pushes to the store with group name + duration enum")}`, async () => {
	const planId = `rc-sync-live-${Date.now()}`;
	await cleanup(planId);

	await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: APPS,
		isLive: true,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro", "Premium"),
	});

	const storePushes = fetchCalls.filter((c) =>
		c.url.includes("/create_in_store"),
	);
	expect(storePushes).toHaveLength(APPS.length);
	expect(storePushes[0].body).toEqual({
		store_information: {
			duration: "ONE_MONTH",
			subscription_group_name: "Autumn - Premium Group",
		},
	});

	await cleanup(planId);
});

test(`${chalk.yellowBright("rc sync: unions into an existing manual mapping without clobbering it")}`, async () => {
	const planId = `rc-sync-union-${Date.now()}`;
	await cleanup(planId);

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: ctx.env,
			autumn_product_id: planId,
			revenuecat_product_ids: ["com.legacy.manual.id"],
		},
	});

	await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: APPS,
		isLive: false,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro"),
	});

	const ids = await getMappingIds(planId);
	expect(ids).toContain("com.legacy.manual.id");
	expect(ids).toContain(storeId(planId));

	await cleanup(planId);
});

test(`${chalk.yellowBright("rc sync: patches name when the RC product already exists with a different name")}`, async () => {
	const planId = `rc-sync-rename-${Date.now()}`;
	await cleanup(planId);

	existingProducts = APPS.map((app, i) => ({
		id: `existing_${i}`,
		app_id: app.id,
		store_identifier: storeId(planId),
		display_name: "Old Name",
	}));

	await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: APPS,
		isLive: false,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro"),
	});

	expect(
		fetchCalls.filter(
			(c) => c.method === "POST" && c.url.split("?")[0].endsWith("/products"),
		),
	).toHaveLength(0);
	const updates = fetchCalls.filter(
		(c) => c.method === "POST" && /\/products\/existing_\d+$/.test(c.url),
	);
	expect(updates).toHaveLength(APPS.length);
	expect(updates[0].body).toEqual({ display_name: "Pro" });

	await cleanup(planId);
});

const testStoreApp: RevenueCatApp = {
	object: "app",
	id: "app_test",
	name: "Test Store",
	type: "test_store",
	project_id: "proj_test",
	created_at: 0,
};

test(`${chalk.yellowBright("rc sync: test_store plan with no base price (free) sets no MCP price")}`, async () => {
	const planId = `rc-sync-noprice-${Date.now()}`;
	await cleanup(planId);

	await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: [testStoreApp],
		isLive: false,
		projectId: "proj_test",
		product: buildProduct(planId, "Free", undefined, 0),
	});

	expect(
		fetchCalls.some((c) => c.url.startsWith("https://mcp.revenuecat.ai")),
	).toBe(false);

	await cleanup(planId);
});

test(`${chalk.yellowBright("rc sync: MCP price failure is best-effort — sync still succeeds")}`, async () => {
	const planId = `rc-sync-pricefail-${Date.now()}`;
	await cleanup(planId);
	mcpError = true;

	const result = await syncProductToRevenueCat({
		ctx,
		rcCli: rcCli(),
		apps: [testStoreApp],
		isLive: false,
		projectId: "proj_test",
		product: buildProduct(planId, "Pro"),
	});

	expect(
		fetchCalls.some((c) => c.url.startsWith("https://mcp.revenuecat.ai")),
	).toBe(true);
	expect(result.status).toBe("synced");
	expect(result.apps?.[0].price).toBe("failed");

	await cleanup(planId);
});
