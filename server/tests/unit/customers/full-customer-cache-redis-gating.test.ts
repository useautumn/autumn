import { beforeEach, describe, expect, mock, test } from "bun:test";
import { CustomerNotFoundError, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	cached: undefined as FullCustomer | undefined,
	dbResult: undefined as FullCustomer | undefined,
	hydrated: undefined as FullCustomer | undefined,
	created: undefined as FullCustomer | undefined,
	cacheReads: 0,
	cacheWrites: 0,
	dbCalls: 0,
	createCalls: 0,
	updateDetailsCalls: 0,
};

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () => {
			mockState.dbCalls++;
			return mockState.dbResult;
		},
	},
}));

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js",
	() => ({
		getCachedFullCustomer: async () => {
			mockState.cacheReads++;
			return mockState.cached;
		},
	}),
);

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/setCachedFullCustomer.js",
	() => ({
		setCachedFullCustomer: async () => {
			mockState.cacheWrites++;
			return "OK";
		},
	}),
);

mock.module("@/internal/customers/cusUtils/getFullCustomerSchedule.js", () => ({
	hydrateFullCustomerSchedule: async ({
		fullCustomer,
	}: {
		fullCustomer: unknown;
	}) => mockState.hydrated ?? fullCustomer,
}));

mock.module("@/internal/customers/actions/index.js", () => ({
	customerActions: {
		createWithDefaults: async () => {
			mockState.createCalls++;
			return mockState.created;
		},
	},
}));

mock.module(
	"@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js",
	() => ({
		autoCreateEntity: async () => null,
	}),
);

mock.module("@/internal/customers/cusUtils/cusUtils.js", () => ({
	updateCustomerDetails: async () => {
		mockState.updateDetailsCalls++;
	},
}));

import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

const makeCtx = ({ skipCache = false }: { skipCache?: boolean } = {}) =>
	({
		skipCache,
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
	}) as AutumnContext;

const makeFullCustomer = (id: string) =>
	({
		id,
		internal_id: `int_${id}`,
		org_id: "test_org",
		created_at: Date.now(),
		env: "sandbox",
		name: null,
		email: null,
		metadata: {},
		processor: null,
		send_email_receipts: false,
		customer_products: [],
		extra_customer_entitlements: [],
		entities: [],
	}) as FullCustomer;

describe("full customer cache Redis gating", () => {
	beforeEach(() => {
		mockState.cached = undefined;
		mockState.dbResult = undefined;
		mockState.hydrated = undefined;
		mockState.created = undefined;
		mockState.cacheReads = 0;
		mockState.cacheWrites = 0;
		mockState.dbCalls = 0;
		mockState.createCalls = 0;
		mockState.updateDetailsCalls = 0;
	});

	test("getOrSetCachedFullCustomer skips Redis read/write when skipCache is true", async () => {
		const dbCustomer = makeFullCustomer("db-customer");

		mockState.cached = makeFullCustomer("cached-customer");
		mockState.dbResult = dbCustomer;

		const result = await getOrSetCachedFullCustomer({
			ctx: makeCtx({ skipCache: true }),
			customerId: "db-customer",
			source: "unit-test",
		});

		expect(result).toBe(dbCustomer);
		expect(mockState.cacheReads).toBe(0);
		expect(mockState.cacheWrites).toBe(0);
		expect(mockState.dbCalls).toBe(1);
	});

	test("getOrCreateCachedFullCustomer still creates when skipCache is true and DB misses", async () => {
		const createdCustomer = makeFullCustomer("created-customer");

		mockState.dbResult = undefined;
		mockState.created = createdCustomer;

		const result = await getOrCreateCachedFullCustomer({
			ctx: makeCtx({ skipCache: true }),
			params: {
				customer_id: "created-customer",
				feature_id: "messages",
			},
			source: "unit-test",
		});

		expect(result).toBe(createdCustomer);
		expect(mockState.cacheReads).toBe(0);
		expect(mockState.cacheWrites).toBe(0);
		expect(mockState.dbCalls).toBe(1);
		expect(mockState.createCalls).toBe(1);
	});

	test("getOrCreateCachedFullCustomer honors skipCreate when skipCache is true and DB misses", async () => {
		mockState.dbResult = undefined;

		await expect(
			getOrCreateCachedFullCustomer({
				ctx: makeCtx({ skipCache: true }),
				params: {
					customer_id: "missing-customer",
					feature_id: "messages",
				},
				source: "unit-test",
				skipCreate: true,
			}),
		).rejects.toBeInstanceOf(CustomerNotFoundError);

		expect(mockState.cacheReads).toBe(0);
		expect(mockState.cacheWrites).toBe(0);
		expect(mockState.dbCalls).toBe(1);
		expect(mockState.createCalls).toBe(0);
	});
});
