import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const state = { existing: false, inserts: 0, attaches: 0 };

const mockedPaths = [
	"@/internal/customers/CusService.js",
	"@/internal/api/entities/EntityService.js",
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
] as const;
const realModules = new Map<string, Record<string, unknown>>();
for (const path of mockedPaths) {
	realModules.set(path, { ...(await import(path)) });
}

afterAll(() => {
	for (const [path, realModule] of realModules) {
		mock.module(path, () => realModule);
	}
});

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () => ({
			id: "customer",
			internal_id: "customer_internal",
			customer_products: [],
			entities: [],
		}),
	},
}));
mock.module("@/internal/api/entities/EntityService.js", () => ({
	EntityService: {
		get: async () => (state.existing ? { id: "entity" } : undefined),
		insert: async ({
			data,
			ignoreConflicts,
		}: {
			data: unknown[];
			ignoreConflicts?: boolean;
		}) => {
			state.inserts++;
			if (ignoreConflicts && state.existing) return [];
			return data;
		},
	},
}));
mock.module(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
	() => ({
		attachDefaultProductsToEntities: async () => {
			state.attaches++;
		},
	}),
);

const { replayFailedEntityCreation } = await import(
	// @ts-expect-error Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/recovery/replayFailedEntityCreation.js?stableEntityRecovery"
);

const context = () =>
	({
		org: { id: "org" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		features: [{ id: "seats", internal_id: "feature_internal" }],
		skipCache: false,
		db: { transaction: async (fn: (tx: object) => Promise<void>) => fn({}) },
	}) as unknown as AutumnContext;

describe("replayFailedEntityCreation", () => {
	beforeEach(() => {
		state.existing = false;
		state.inserts = 0;
		state.attaches = 0;
	});
	test("inserts only missing stable-ID entities with their defaults in one transaction", async () => {
		await replayFailedEntityCreation({
			ctx: context(),
			payload: {
				kind: "entity",
				orgId: "org",
				env: AppEnv.Live,
				customerId: "customer",
				requestId: "request",
				apiVersion: ApiVersion.V2_1,
				params: {
					customer_id: "customer",
					create_entity_data: [{ id: "entity", feature_id: "seats" }],
				},
			},
		});
		expect(state.inserts).toBe(1);
		expect(state.attaches).toBe(1);
	});
	test("does nothing when the entity already exists", async () => {
		state.existing = true;
		await replayFailedEntityCreation({
			ctx: context(),
			payload: {
				kind: "entity",
				orgId: "org",
				env: AppEnv.Live,
				customerId: "customer",
				requestId: "request",
				apiVersion: ApiVersion.V2_1,
				params: {
					customer_id: "customer",
					create_entity_data: [{ id: "entity", feature_id: "seats" }],
				},
			},
		});
		expect(state.inserts).toBe(1);
		expect(state.attaches).toBe(0);
	});
});
