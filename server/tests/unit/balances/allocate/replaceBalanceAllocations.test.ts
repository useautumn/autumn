import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	AppEnv,
	type BalanceAllocations,
	type FullSubject,
	ResetInterval,
	type UsageWindow,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withAllocationLock } from "@/internal/balances/allocate/repos/allocationStore.js";

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

const nestedTransaction = mock(() => {
	throw new Error("allocation replacement must reuse the caller transaction");
});
const tx = {
	transaction: nestedTransaction,
	select: () => ({
		from: () => ({
			where: () => ({
				for: async (mode: string) => {
					expect(mode).toBe("update");
					events.push("lock");
					return [];
				},
			}),
		}),
	}),
} as unknown as DrizzleCli;
const ctx = {
	db: tx,
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
} as AutumnContext;
const preparedSubject = {
	customerId: "customer_123",
	customer: { internal_id: "cus_123" },
} as FullSubject;
const currentSubject = {
	...preparedSubject,
	customer_products: [],
} as FullSubject;
const events: string[] = [];
const writtenAllocations: BalanceAllocations[] = [];
let failFeature: string | undefined;
const counter = { usage: 12 } as UsageWindow;

mock.module(paths[0], () => ({
	...originals.get(paths[0]),
	writeAllocations: async ({
		allocations,
	}: {
		allocations: BalanceAllocations;
	}) => {
		writtenAllocations.push(allocations);
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
	getFullSubjectNormalized: async ({
		ctx: readCtx,
		customerId,
		readFrom,
		runLazyResets,
	}: {
		ctx: AutumnContext;
		customerId: string;
		readFrom: string;
		runLazyResets: boolean;
	}) => {
		expect(readCtx.db).toBe(tx);
		expect(customerId).toBe("customer_123");
		expect(readFrom).toBe("primary");
		expect(runLazyResets).toBe(false);
		events.push("read-current");
		return { fullSubject: currentSubject };
	},
}));

const { replaceBalanceAllocations } = await import(
	// @ts-expect-error Bun isolates the mocked module with a query suffix.
	"@/internal/balances/allocate/replaceBalanceAllocations.js?replacementFreshness"
);

beforeEach(() => {
	events.length = 0;
	writtenAllocations.length = 0;
	failFeature = undefined;
	nestedTransaction.mockClear();
});
const control = (featureId: string) => ({
	feature_id: featureId,
	interval: ResetInterval.Month,
	allocations: [{ entity_id: "entity_123", amount: 20 }],
});

test("replacement reads current balances under its lock and returns counter deltas", async () => {
	const result = await replaceBalanceAllocations({
		ctx,
		tx,
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
	expect(nestedTransaction).not.toHaveBeenCalled();
});

test("replacement validates every feature before writing any counters or config", async () => {
	failFeature = "messages";
	await expect(
		replaceBalanceAllocations({
			ctx,
			tx,
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
		tx,
		fullSubject: preparedSubject,
		controls: [],
	});
	expect(result.allocations).toEqual({});
	expect(writtenAllocations).toEqual([{}]);
	expect(result.counterPatches).toEqual([]);
});

test("allocation locks still open a transaction when no caller transaction is supplied", async () => {
	const transaction = mock(async (fn: (tx: DrizzleCli) => Promise<string>) =>
		fn(tx),
	);
	const result = await withAllocationLock({
		ctx: { ...ctx, db: { transaction } as unknown as DrizzleCli },
		internalCustomerId: "cus_123",
		fn: async ({ tx: lockedTx }) => {
			expect(lockedTx).toBe(tx);
			return "locked";
		},
	});
	expect(result).toBe("locked");
	expect(transaction).toHaveBeenCalledTimes(1);
	expect(nestedTransaction).not.toHaveBeenCalled();
});
