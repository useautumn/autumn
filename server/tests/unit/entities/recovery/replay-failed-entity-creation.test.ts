import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	EntityErrorCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const state = { existing: false, inserts: 0, attaches: 0, conflictOnce: false };

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
		insert: async ({ data }: { data: unknown[] }) => {
			state.inserts++;
			if (state.conflictOnce) {
				state.conflictOnce = false;
				throw new RecaseError({
					message: "Entity already exists",
					code: EntityErrorCode.EntityAlreadyExists,
					statusCode: 409,
				});
			}
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
		state.conflictOnce = false;
	});
	test("rechecks and retries when an insert races", async () => {
		state.conflictOnce = true;
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
		expect(state.inserts).toBe(2);
		expect(state.attaches).toBe(1);
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
		expect(state.inserts).toBe(0);
		expect(state.attaches).toBe(0);
	});
});
