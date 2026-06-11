import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { ErrCode } from "@autumn/shared";

// Map-backed CacheManager stub — getModelsDevPricing's cache key is shared
// with the dev server, so the real Redis must never be touched here.
const store = new Map<string, unknown>();
const setJsonCalls: { key: string; value: unknown; ttl?: number }[] = [];

mock.module("@/utils/cacheUtils/CacheManager.js", () => ({
	CacheManager: {
		getJson: async (key: string) => store.get(key) ?? null,
		setJson: async (key: string, value: unknown, ttl?: number) => {
			setJsonCalls.push({ key, value, ttl });
			store.set(key, value);
		},
	},
}));

const { getModelsDevPricing } = await import(
	"@/internal/features/utils/getModelPricing.js"
);

const PRIMARY_KEY = "models_dev_pricing";
const STALE_KEY = "models_dev_pricing_stale";

const pricingData = {
	anthropic: { id: "anthropic", name: "Anthropic", models: {} },
};
const stalePricingData = {
	openai: { id: "openai", name: "OpenAI", models: {} },
};

const realFetch = globalThis.fetch;
let fetchCalls = 0;

const stubFetch = (impl: () => Promise<Response>) => {
	globalThis.fetch = Object.assign(
		async () => {
			fetchCalls++;
			return await impl();
		},
		{ preconnect: realFetch.preconnect },
	);
};

afterEach(() => {
	store.clear();
	setJsonCalls.length = 0;
	fetchCalls = 0;
	globalThis.fetch = realFetch;
});

afterAll(() => {
	mock.restore();
	globalThis.fetch = realFetch;
});

test("primary cache hit returns cached data without fetching", async () => {
	store.set(PRIMARY_KEY, pricingData);
	stubFetch(() => {
		throw new Error("should not fetch");
	});

	const result = await getModelsDevPricing();

	expect(result).toEqual(pricingData);
	expect(fetchCalls).toBe(0);
});

test("cache miss fetches and populates primary + stale caches", async () => {
	stubFetch(async () => Response.json(pricingData));

	const result = await getModelsDevPricing();

	expect(result).toEqual(pricingData);
	expect(fetchCalls).toBe(1);

	// Cache writes are fire-and-forget — flush microtasks before asserting
	await Bun.sleep(0);
	expect(setJsonCalls).toEqual([
		{ key: PRIMARY_KEY, value: pricingData, ttl: 60 * 60 * 3 },
		{ key: STALE_KEY, value: pricingData, ttl: 60 * 60 * 24 * 3 },
	]);
});

test("non-ok response falls back to the stale cache", async () => {
	store.set(STALE_KEY, stalePricingData);
	stubFetch(async () => new Response("oops", { status: 500 }));

	const result = await getModelsDevPricing();

	expect(result).toEqual(stalePricingData);
});

test("fetch network error falls back to the stale cache", async () => {
	store.set(STALE_KEY, stalePricingData);
	stubFetch(() => {
		throw new Error("network down");
	});

	const result = await getModelsDevPricing();

	expect(result).toEqual(stalePricingData);
});

test("fetch failure with no stale cache throws InternalError", async () => {
	stubFetch(() => {
		throw new Error("network down");
	});

	await expect(getModelsDevPricing()).rejects.toMatchObject({
		code: ErrCode.InternalError,
		message: "Failed to fetch models.dev pricing and no cache available",
	});
});

test("fetch carries an abort timeout so a hanging models.dev cannot hang tracks", async () => {
	let capturedSignal: AbortSignal | undefined;
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			fetchCalls++;
			capturedSignal = init?.signal ?? undefined;
			return Response.json(pricingData);
		},
		{ preconnect: realFetch.preconnect },
	) as typeof fetch;

	await getModelsDevPricing();

	expect(capturedSignal).toBeInstanceOf(AbortSignal);
	expect(capturedSignal?.aborted).toBe(false);
});
