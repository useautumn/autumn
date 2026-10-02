import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	type BalanceAllocations,
	type FullSubject,
	ResetInterval,
	type UsageWindow,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const paths = [
	"@/internal/balances/allocate/repos/allocationStore.js",
	"@/internal/balances/allocate/repos/setAllocationCounters.js",
	"@/internal/balances/allocate/computeAllocationUpdate.js",
	"@/internal/customers/repos/getFullSubject/getFullSubject.js",
] as const;
const originals = new Map<string, Record<string, unknown>>();
for (const path of paths) originals.set(path, { ...(await import(path)) });
afterAll(() => {
	for (const [path, exports] of originals) mock.module(path, () => exports);
});

const tx = {} as DrizzleCli;
const ctx = { db: {} } as AutumnContext;
const preparedSubject = {
	customerId: "customer_123",
	customer: { internal_id: "cus_123" },
} as FullSubject;
const currentSubject = {
	...preparedSubject,
	customer_products: [],
} as FullSubject;
const events: string[] = [];
let failFeature: string | undefined;
const counter = { usage: 12 } as UsageWindow;

mock.module(paths[0], () => ({
	...originals.get(paths[0]),
	withAllocationLock: async ({
		fn,
	}: {
		fn: (params: {
			tx: DrizzleCli;
			allocations: BalanceAllocations | null;
		}) => Promise<unknown>;
	}) => {
		events.push("lock");
		return fn({ tx, allocations: null });
	},
	writeAllocations: async () => {
		events.push("write-config");
	},
}));
mock.module(paths[1], () => ({
	setAllocationCounters: async () => {
		events.push("write-counters");
	},
}));
mock.module(paths[2], () => ({
	computeAllocationUpdate: async ({
		ctx: computeCtx,
		fullSubject,
		params,
	}: {
		ctx: AutumnContext;
		fullSubject: FullSubject;
		params: { feature_id: string };
	}) => {
		expect(computeCtx.db).toBe(tx);
		expect(fullSubject).toBe(currentSubject);
		events.push(`compute:${params.feature_id}`);
		if (params.feature_id === failFeature)
			throw new Error("invalid allocation");
		return {
			allocation: { amounts: { ent_123: 20 }, scale: 1 },
			internalFeatureId: params.feature_id,
			counters: [{ ...counter, readUsage: 5 }],
		};
	},
}));
mock.module(paths[3], () => ({
	...originals.get(paths[3]),
	getFullSubject: async ({
		ctx: readCtx,
		customerId,
		readFrom,
	}: {
		ctx: AutumnContext;
		customerId: string;
		readFrom: string;
	}) => {
		expect(readCtx.db).toBe(tx);
		expect(customerId).toBe("customer_123");
		expect(readFrom).toBe("primary");
		events.push("read-current");
		return currentSubject;
	},
}));

const { replaceBalanceAllocations } = await import(
	// @ts-expect-error Bun isolates the mocked module with a query suffix.
	"@/internal/balances/allocate/replaceBalanceAllocations.js?replacementFreshness"
);

beforeEach(() => {
	events.length = 0;
	failFeature = undefined;
});
const control = (featureId: string) => ({
	feature_id: featureId,
	interval: ResetInterval.Month,
	allocations: [{ entity_id: "entity_123", amount: 20 }],
});

test("replacement reads current balances under its lock and returns counter deltas", async () => {
	const result = await replaceBalanceAllocations({
		ctx,
		fullSubject: preparedSubject,
		controls: [control("credits")],
	});
	expect(events).toEqual([
		"lock",
		"read-current",
		"compute:credits",
		"write-counters",
		"write-config",
	]);
	expect(result.counterPatches).toEqual([{ counter, usageDelta: 7 }]);
});

test("replacement validates every feature before writing any counters or config", async () => {
	failFeature = "messages";
	await expect(
		replaceBalanceAllocations({
			ctx,
			fullSubject: preparedSubject,
			controls: [control("credits"), control("messages")],
		}),
	).rejects.toThrow("invalid allocation");
	expect(events).toEqual([
		"lock",
		"read-current",
		"compute:credits",
		"compute:messages",
	]);
});

test("clearing allocations returns no counter patches", async () => {
	const result = await replaceBalanceAllocations({
		ctx,
		fullSubject: preparedSubject,
		controls: [],
	});
	expect(result.allocations).toEqual({});
	expect(result.counterPatches).toEqual([]);
});
