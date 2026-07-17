/**
 * Pins the safe legacy-track cache-miss bridge: existing subjects without
 * inline customer/entity mutation data use the serialized FullSubject rebuild,
 * while genuine create/update payloads remain on their legacy owner path.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const buildFullSubject = (label: string) =>
	({
		label,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer: { id: "customer_1", internal_id: "internal_customer_1" },
		customer_products: [],
		extra_customer_entitlements: [],
		invoices: [],
		subjectType: "customer",
	}) as unknown as FullSubject;

const lockedDb = { marker: "legacy-balance-sync-transaction" };
const mockState = {
	cacheReads: [] as Array<Record<string, unknown>>,
	lockCount: 0,
	databaseReadDbs: [] as unknown[],
	fullSubject: buildFullSubject("database"),
	updateCustomerDataCalls: 0,
	createCustomerCalls: 0,
	autoCreateEntityCalls: 0,
};

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async (args: Record<string, unknown>) => {
			mockState.cacheReads.push(args);
			return { fullSubject: undefined, subjectViewEpoch: 4 };
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
				customer: mockState.fullSubject.customer,
				customer_entitlements: [],
			},
			fullSubject: mockState.fullSubject,
		};
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
		rehydrateWithLiveBalances: async () => mockState.fullSubject,
	}),
);

mock.module("@/internal/customers/actions/index.js", () => ({
	customerActions: {
		createWithDefaults: async () => {
			mockState.createCustomerCalls += 1;
			throw new Error("unexpected customer create");
		},
	},
}));

mock.module("@/internal/customers/actions/updateCustomerData.js", () => ({
	updateCustomerData: async () => {
		mockState.updateCustomerDataCalls += 1;
		return false;
	},
}));

mock.module(
	"@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js",
	() => ({
		autoCreateEntity: async () => {
			mockState.autoCreateEntityCalls += 1;
			return undefined;
		},
	}),
);

const { getOrCreateCachedFullSubject } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js?balanceSyncLock"
);

const ctx = {
	skipCache: false,
	logger: { debug: mock(() => {}), error: mock(() => {}) },
} as unknown as AutumnContext;

describe("getOrCreateCachedFullSubject balance-sync bridge", () => {
	beforeEach(() => {
		mockState.cacheReads = [];
		mockState.lockCount = 0;
		mockState.databaseReadDbs = [];
		mockState.fullSubject = buildFullSubject("database");
		mockState.updateCustomerDataCalls = 0;
		mockState.createCustomerCalls = 0;
		mockState.autoCreateEntityCalls = 0;
	});

	test("serializes an existing subject miss when no inline mutation data is present", async () => {
		const result = await getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: "customer_1",
				feature_id: "messages",
			},
			source: "legacy-track",
		});

		expect(result).toBe(mockState.fullSubject);
		expect(mockState.lockCount).toBe(1);
		expect(mockState.databaseReadDbs).toEqual([lockedDb]);
		expect(mockState.cacheReads).toHaveLength(2);
		expect(mockState.cacheReads[1]?.balanceSyncDb).toBe(lockedDb);
		expect(mockState.updateCustomerDataCalls).toBe(0);
		expect(mockState.createCustomerCalls).toBe(0);
		expect(mockState.autoCreateEntityCalls).toBe(0);
	});

	test("leaves inline customer-data mutation on the legacy owner path", async () => {
		const result = await getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: "customer_1",
				feature_id: "messages",
				customer_data: { name: "Updated name" },
			},
			source: "legacy-track-with-customer-data",
		});

		expect(result).toBe(mockState.fullSubject);
		expect(mockState.lockCount).toBe(0);
		expect(mockState.databaseReadDbs).toEqual([undefined]);
		expect(mockState.updateCustomerDataCalls).toBe(1);
		expect(mockState.createCustomerCalls).toBe(0);
	});
});

afterAll(() => {
	mock.restore();
});
