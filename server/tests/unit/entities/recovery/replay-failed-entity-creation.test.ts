/**
 * Recovery only persists the missing entity and its free default products.
 * It must never re-enter seat charging, balance mutation, or Stripe billing.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	EntityErrorCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { EntityCreationRecoveryPayload } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";

const mockState = {
	batchCreateCalls: [] as Record<string, unknown>[],
	entityInsertCalls: [] as Record<string, unknown>[],
	defaultPlanCalls: [] as Record<string, unknown>[],
	executePlanCalls: [] as Record<string, unknown>[],
	entityInsertError: undefined as unknown,
	existingEntities: [] as Record<string, unknown>[],
};

const mockedPaths = [
	"@/internal/entities/actions/batchCreateEntities.js",
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	"@/internal/customers/CusService.js",
	"@/internal/api/entities/EntityService.js",
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

mock.module("@/internal/entities/actions/batchCreateEntities.js", () => ({
	batchCreateEntities: async (args: Record<string, unknown>) => {
		mockState.batchCreateCalls.push(args);
	},
}));

mock.module(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
	() => ({
		buildEntityDefaultProductsPlans: async (args: Record<string, unknown>) => {
			mockState.defaultPlanCalls.push(args);
			return [{ customerId: "customer_123", insertCustomerProducts: [] }];
		},
	}),
);

mock.module(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: async (args: Record<string, unknown>) => {
			mockState.executePlanCalls.push(args);
		},
	}),
);

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		get: async () => ({ id: "customer_123", internal_id: "icus_123" }),
		getFull: async () => ({
			id: "customer_123",
			internal_id: "icus_123",
			customer_products: [],
		}),
	},
}));

mock.module("@/internal/api/entities/EntityService.js", () => ({
	EntityService: {
		insert: async (args: Record<string, unknown>) => {
			mockState.entityInsertCalls.push(args);
			if (mockState.entityInsertError) throw mockState.entityInsertError;
			return args.data;
		},
		get: async ({ id }: { id: string }) =>
			mockState.existingEntities.find((entity) => entity.id === id),
	},
}));

const { replayFailedEntityCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/recovery/replayFailedEntityCreation.js?entityRecoveryTransaction"
);

const transactionDb = { name: "transaction" };
const buildContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		features: [{ id: "seats", internal_id: "if_seats" }],
		extraLogs: {},
		skipCache: false,
		db: {
			transaction: async (fn: (tx: typeof transactionDb) => Promise<void>) =>
				fn(transactionDb),
		},
		logger: { info: mock(() => {}), error: mock(() => {}) },
	}) as unknown as AutumnContext;

const buildPayload = ({
	createEntityData = [
		{ id: "entity_123", name: "Entity", feature_id: "seats" },
	],
	mayHaveWritten = false,
}: {
	createEntityData?: EntityCreationRecoveryPayload["params"]["create_entity_data"];
	mayHaveWritten?: boolean;
} = {}): EntityCreationRecoveryPayload => ({
	kind: "entity",
	orgId: "org_123",
	env: AppEnv.Live,
	customerId: "customer_123",
	requestId: "req_entity_123",
	apiVersion: ApiVersion.V2_1,
	params: {
		customer_id: "customer_123",
		create_entity_data: createEntityData,
		customer_data: { email: "customer@example.com" },
	},
	mayHaveWritten,
});

describe("replayFailedEntityCreation", () => {
	beforeEach(() => {
		mockState.batchCreateCalls = [];
		mockState.entityInsertCalls = [];
		mockState.defaultPlanCalls = [];
		mockState.executePlanCalls = [];
		mockState.entityInsertError = undefined;
		mockState.existingEntities = [];
	});

	test("atomically inserts entities and attaches free defaults without replaying seat billing", async () => {
		const ctx = buildContext();
		await replayFailedEntityCreation({ ctx, payload: buildPayload() });

		expect(mockState.batchCreateCalls).toHaveLength(0);
		expect(mockState.entityInsertCalls).toEqual([
			expect.objectContaining({ db: transactionDb }),
		]);
		expect(mockState.defaultPlanCalls).toEqual([
			expect.objectContaining({
				ctx,
				customerData: { email: "customer@example.com" },
			}),
		]);
		expect(mockState.executePlanCalls).toEqual([
			expect.objectContaining({
				ctx: expect.objectContaining({ db: transactionDb }),
			}),
		]);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
		});
	});

	test("still treats an insert conflict as an already-created request", async () => {
		mockState.entityInsertError = new RecaseError({
			message: "Entity entity_123 already exists",
			code: EntityErrorCode.EntityAlreadyExists,
			statusCode: 409,
		});
		mockState.existingEntities = [{ id: "entity_123" }];
		const ctx = buildContext();

		await replayFailedEntityCreation({ ctx, payload: buildPayload() });

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "already_exists",
		});
	});

	test("logs entities that were not confirmed after a batch conflict", async () => {
		mockState.entityInsertError = new RecaseError({
			message: "Entity entity_123 already exists",
			code: EntityErrorCode.EntityAlreadyExists,
			statusCode: 409,
		});
		mockState.existingEntities = [{ id: "entity_123" }];
		const ctx = buildContext();

		await replayFailedEntityCreation({
			ctx,
			payload: buildPayload({
				createEntityData: [
					{ id: "entity_123", name: "Entity", feature_id: "seats" },
					{ id: "entity_456", name: "Other", feature_id: "seats" },
				],
			}),
		});

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "partially_created",
			unconfirmed: [{ id: "entity_456", feature_id: "seats" }],
		});
	});

	test("does not replay a request that may have already mutated state", async () => {
		const ctx = buildContext();

		await expect(
			replayFailedEntityCreation({
				ctx,
				payload: buildPayload({ mayHaveWritten: true }),
			}),
		).rejects.toThrow("requires manual review");

		expect(mockState.entityInsertCalls).toHaveLength(0);
	});

	test("does not trust a capture that predates the write marker", async () => {
		const ctx = buildContext();
		const payloadWithoutMarker = buildPayload();
		delete payloadWithoutMarker.mayHaveWritten;

		await expect(
			replayFailedEntityCreation({
				ctx,
				payload: payloadWithoutMarker,
			}),
		).rejects.toThrow("requires manual review");
	});
});
