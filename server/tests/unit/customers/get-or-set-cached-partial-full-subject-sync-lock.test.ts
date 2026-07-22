/**
 * Pins the partial FullSubject cache path used by check: hits stay on the fast
 * path, while misses use the same serialized rebuild as full-subject reads.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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

const lockedDb = { marker: "partial-balance-sync-transaction" };
const mockState = {
	partialReads: [] as Array<Record<string, unknown>>,
	partialCache: undefined as FullSubject | undefined,
	lockCount: 0,
	databaseReadDbs: [] as unknown[],
	databaseSubject: buildFullSubject("database"),
};

mock.module(
	"@/internal/customers/cache/fullSubject/actions/partial/getCachedPartialFullSubject.js",
	() => ({
		getCachedPartialFullSubject: async (args: Record<string, unknown>) => {
			mockState.partialReads.push(args);
			return {
				fullSubject: mockState.partialCache,
				subjectViewEpoch: 7,
			};
		},
	}),
);

mock.module(
	"@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js",
	() => ({
		withCustomerBalanceSyncLock: async ({
			callback,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<FullSubject>;
		}) => {
			mockState.lockCount += 1;
			return callback({ db: lockedDb });
		},
	}),
);

mock.module("@/internal/customers/repos/getFullSubject/index.js", () => ({
	getFullSubjectQuery: () => {
		throw new Error("unexpected getFullSubjectQuery call");
	},
	getFullSubjectNormalized: async ({
		balanceSyncDb,
	}: {
		balanceSyncDb?: unknown;
	}) => {
		mockState.databaseReadDbs.push(balanceSyncDb);
		return {
			normalized: {
				customerId: "customer_1",
				internalCustomerId: "internal_customer_1",
				customer_entitlements: [],
			},
			fullSubject: mockState.databaseSubject,
		};
	},
	resultToFullSubject: () => {
		throw new Error("unexpected resultToFullSubject call");
	},
}));

mock.module(
	"@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js",
	() => ({
		setCachedFullSubject: async () => "OK",
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/actions/rehydrateWithLiveBalances.js",
	() => ({
		rehydrateWithLiveBalances: async () => mockState.databaseSubject,
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/filterFullSubjectByFeatureIds.js",
	() => ({
		filterFullSubjectByFeatureIds: ({
			fullSubject,
		}: {
			fullSubject: FullSubject;
		}) => fullSubject,
	}),
);

const { getOrSetCachedPartialFullSubject } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.js?balanceSyncLock"
);

const ctx = {
	skipCache: false,
	logger: { debug: mock(() => {}) },
} as unknown as AutumnContext;

describe("getOrSetCachedPartialFullSubject balance-sync serialization", () => {
	beforeEach(() => {
		mockState.partialReads = [];
		mockState.partialCache = undefined;
		mockState.lockCount = 0;
		mockState.databaseReadDbs = [];
		mockState.databaseSubject = buildFullSubject("database");
	});

	test("keeps a partial cache hit on the lock-free fast path", async () => {
		const hit = buildFullSubject("cache-hit");
		mockState.partialCache = hit;

		const result = await getOrSetCachedPartialFullSubject({
			ctx,
			customerId: "customer_1",
			featureIds: ["messages"],
			source: "partial-hit",
		});

		expect(result).toBe(hit);
		expect(mockState.lockCount).toBe(0);
		expect(mockState.databaseReadDbs).toHaveLength(0);
	});

	test("rechecks a partial miss and queries with the lock transaction", async () => {
		const result = await getOrSetCachedPartialFullSubject({
			ctx,
			customerId: "customer_1",
			featureIds: ["messages"],
			source: "partial-miss",
		});

		expect(result).toBe(mockState.databaseSubject);
		expect(mockState.lockCount).toBe(1);
		expect(mockState.databaseReadDbs).toEqual([lockedDb]);
		expect(mockState.partialReads).toHaveLength(2);
		expect(mockState.partialReads[0]?.balanceSyncDb).toBeUndefined();
		expect(mockState.partialReads[1]?.balanceSyncDb).toBe(lockedDb);
		expect(mockState.partialReads[1]?.featureIds).toEqual(["messages"]);
	});
});

afterAll(() => {
	mock.restore();
});
