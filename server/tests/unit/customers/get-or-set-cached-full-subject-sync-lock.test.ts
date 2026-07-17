/**
 * Regression coverage for FullSubject cache fills racing a customer lifecycle.
 *
 * Red failure mode:
 * - a cache miss reads Postgres without the customer balance-sync lock, so it can
 *   publish the pre-commit lifecycle state at the lifecycle's new cache epoch;
 * - competing misses each query Postgres; and
 * - a losing CACHE_EXISTS / STALE_WRITE fill returns its own DB snapshot rather
 *   than the cache winner.
 *
 * Green success criteria:
 * - misses wait for the customer balance-sync lock, recheck after acquiring it,
 *   query through the lock transaction, and reread any cache winner.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullSubject, NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

const buildFullSubject = (label: string) =>
	({
		label,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [],
		invoices: [],
		subjectType: "customer",
	}) as unknown as FullSubject;

const buildNormalized = (label: string) =>
	({
		label,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer_entitlements: [],
	}) as unknown as NormalizedFullSubject;

type CacheRead = {
	fullSubject: FullSubject | undefined;
	subjectViewEpoch: number;
};

const lockedDb = { marker: "balance-sync-transaction" };
const mockState = {
	cacheRead: async (): Promise<CacheRead> => ({
		fullSubject: undefined,
		subjectViewEpoch: 1,
	}),
	withLock: async ({
		callback,
	}: {
		callback: ({ db }: { db: unknown }) => Promise<FullSubject>;
	}) => callback({ db: lockedDb }),
	databaseLabel: "database",
	databaseReadCount: 0,
	databaseReadDbs: [] as unknown[],
	beforeDatabaseRead: undefined as undefined | (() => Promise<void>),
	setResult: "OK" as "OK" | "CACHE_EXISTS" | "STALE_WRITE" | "FAILED",
	setCount: 0,
	onSet: undefined as undefined | (() => void),
	rehydrated: undefined as FullSubject | undefined,
};

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async () => mockState.cacheRead(),
	}),
);

mock.module(
	"@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js",
	() => ({
		withCustomerBalanceSyncLock: async (args: {
			callback: ({ db }: { db: unknown }) => Promise<FullSubject>;
		}) => mockState.withLock(args),
	}),
);

mock.module("@/internal/customers/repos/getFullSubject/index.js", () => ({
	getFullSubjectNormalized: async ({
		balanceSyncDb,
	}: {
		balanceSyncDb?: unknown;
	}) => {
		mockState.databaseReadCount += 1;
		mockState.databaseReadDbs.push(balanceSyncDb);
		await mockState.beforeDatabaseRead?.();
		return {
			normalized: buildNormalized(mockState.databaseLabel),
			fullSubject: buildFullSubject(mockState.databaseLabel),
		};
	},
}));

mock.module(
	"@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js",
	() => ({
		setCachedFullSubject: async () => {
			mockState.setCount += 1;
			mockState.onSet?.();
			return mockState.setResult;
		},
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/actions/rehydrateWithLiveBalances.js",
	() => ({
		rehydrateWithLiveBalances: async () => mockState.rehydrated,
	}),
);

const { getOrSetCachedFullSubject } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js?balanceSyncLock"
);

const ctx = {
	skipCache: false,
	logger: {
		debug: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("getOrSetCachedFullSubject balance-sync serialization", () => {
	beforeEach(() => {
		mockState.cacheRead = async () => ({
			fullSubject: undefined,
			subjectViewEpoch: 1,
		});
		mockState.withLock = async ({ callback }) => callback({ db: lockedDb });
		mockState.databaseLabel = "database";
		mockState.databaseReadCount = 0;
		mockState.databaseReadDbs = [];
		mockState.beforeDatabaseRead = undefined;
		mockState.setResult = "OK";
		mockState.setCount = 0;
		mockState.onSet = undefined;
		mockState.rehydrated = undefined;
	});

	test("waits for an in-flight lifecycle and queries through the lock transaction", async () => {
		const lifecycleMayCommit = deferred();
		mockState.withLock = async ({ callback }) => {
			await lifecycleMayCommit.promise;
			return callback({ db: lockedDb });
		};

		const resultPromise = getOrSetCachedFullSubject({
			ctx,
			customerId: "customer_1",
			source: "test",
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(mockState.databaseReadCount).toBe(0);
		mockState.databaseLabel = "after-lifecycle";
		lifecycleMayCommit.resolve();

		const result = await resultPromise;
		expect((result as unknown as { label: string }).label).toBe(
			"after-lifecycle",
		);
		expect(mockState.databaseReadDbs).toEqual([lockedDb]);
	});

	test("a second waiter reuses the first fill without another database query", async () => {
		const firstDatabaseReadStarted = deferred();
		const firstDatabaseReadMayFinish = deferred();
		let cached: FullSubject | undefined;
		let releasePrevious = Promise.resolve();

		mockState.cacheRead = async () => ({
			fullSubject: cached,
			subjectViewEpoch: 1,
		});
		mockState.withLock = async ({ callback }) => {
			const waitForPrevious = releasePrevious;
			const releaseCurrent = deferred();
			releasePrevious = waitForPrevious.then(() => releaseCurrent.promise);
			await waitForPrevious;
			try {
				return await callback({ db: lockedDb });
			} finally {
				releaseCurrent.resolve();
			}
		};
		mockState.databaseLabel = "first-fill";
		mockState.onSet = () => {
			cached = buildFullSubject("first-fill");
		};
		mockState.rehydrated = buildFullSubject("first-fill");

		let holdFirstRead = true;
		mockState.beforeDatabaseRead = async () => {
			if (!holdFirstRead) return;
			holdFirstRead = false;
			firstDatabaseReadStarted.resolve();
			await firstDatabaseReadMayFinish.promise;
		};

		const first = getOrSetCachedFullSubject({
			ctx,
			customerId: "customer_1",
			source: "first",
		});
		await firstDatabaseReadStarted.promise;

		const second = getOrSetCachedFullSubject({
			ctx,
			customerId: "customer_1",
			source: "second",
		});
		await Promise.resolve();
		await Promise.resolve();
		firstDatabaseReadMayFinish.resolve();

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(mockState.databaseReadCount).toBe(1);
		expect((firstResult as unknown as { label: string }).label).toBe(
			"first-fill",
		);
		expect((secondResult as unknown as { label: string }).label).toBe(
			"first-fill",
		);
	});

	for (const losingWrite of ["CACHE_EXISTS", "STALE_WRITE"] as const) {
		test(`rereads the cache winner after ${losingWrite}`, async () => {
			const winner = buildFullSubject(`winner:${losingWrite}`);
			let cached: FullSubject | undefined;
			mockState.cacheRead = async () => ({
				fullSubject: cached,
				subjectViewEpoch: 3,
			});
			mockState.setResult = losingWrite;
			mockState.onSet = () => {
				cached = winner;
			};

			const result = await getOrSetCachedFullSubject({
				ctx,
				customerId: "customer_1",
				source: "losing-fill",
			});

			expect(result).toBe(winner);
			expect(mockState.databaseReadCount).toBe(1);
			expect(mockState.setCount).toBe(1);
		});
	}
});

afterAll(() => {
	mock.restore();
});
