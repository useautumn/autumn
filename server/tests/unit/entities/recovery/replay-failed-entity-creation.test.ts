/**
 * TDD contract for entity creation recovery replay.
 *
 * Contract under test:
 * - Safe failures replay the original normalized create with its API semantics.
 * - Replays cannot enqueue themselves again.
 * - Entity creation is not idempotent, so replay only creates what is missing:
 *   entities the shed request already committed are skipped, including the
 *   single id-less entity a customer may hold per feature.
 * - Failures at or after a seat charge stop for manual billing review.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { EntityCreationRecoveryPayload } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";

const mockState = {
	batchCreateCalls: [] as Record<string, unknown>[],
	existingEntities: [] as Record<string, unknown>[],
	customerFound: true,
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/internal/entities/actions/batchCreateEntities.js",
	"@/internal/customers/CusService.js",
] as const;
const realModules = new Map<string, Record<string, unknown>>();
for (const path of MOCKED_MODULE_PATHS) {
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
		return [];
	},
}));

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () =>
			mockState.customerFound
				? { id: "customer_123", entities: mockState.existingEntities }
				: null,
	},
}));

const { replayFailedEntityCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/recovery/replayFailedEntityCreation.js?entityCreationRecovery"
);

const buildContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		features: [{ id: "seats", internal_id: "if_seats" }],
		extraLogs: {},
		skipCache: false,
		logger: {
			info: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const buildPayload = ({
	failureStage = "lookup",
	createEntityData = [
		{ id: "entity_123", name: "Entity", feature_id: "seats" },
	],
}: {
	failureStage?: EntityCreationRecoveryPayload["failureStage"];
	createEntityData?: EntityCreationRecoveryPayload["params"]["create_entity_data"];
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
	source: "handleCreateEntityV2",
	withAutumnId: true,
	failureStage,
	failedAt: 1_785_000_000_000,
});

describe("replayFailedEntityCreation", () => {
	beforeEach(() => {
		mockState.batchCreateCalls = [];
		mockState.existingEntities = [];
		mockState.customerFound = true;
	});

	test("replays a safe request with its original API semantics", async () => {
		const ctx = buildContext();
		const payload = buildPayload();

		await replayFailedEntityCreation({ ctx, payload });

		expect(ctx.apiVersion.value).toBe(ApiVersion.V2_1);
		expect(ctx.skipCache).toBe(true);
		expect(mockState.batchCreateCalls).toEqual([
			expect.objectContaining({
				ctx,
				customerId: "customer_123",
				createEntityData: payload.params.create_entity_data,
				customerData: payload.params.customer_data,
				withAutumnId: true,
				source: "entityCreationRecovery",
				enqueueRecoveryOnTransientFailure: false,
			}),
		]);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			createdCount: 1,
			skippedCount: 0,
			sourceRequestId: "req_entity_123",
		});
	});

	test("replays against a customer the shed request never created", async () => {
		mockState.customerFound = false;

		await replayFailedEntityCreation({
			ctx: buildContext(),
			payload: buildPayload(),
		});

		expect(mockState.batchCreateCalls).toHaveLength(1);
	});

	test("skips replay when the entity already exists", async () => {
		mockState.existingEntities = [{ id: "entity_123", deleted: false }];
		const ctx = buildContext();

		await replayFailedEntityCreation({
			ctx,
			payload: buildPayload({ failureStage: "completed" }),
		});

		expect(mockState.batchCreateCalls).toHaveLength(0);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "already_exists",
			createdCount: 0,
			skippedCount: 1,
		});
	});

	test("replays a deleted entity id rather than treating it as created", async () => {
		mockState.existingEntities = [{ id: "entity_123", deleted: true }];

		await replayFailedEntityCreation({
			ctx: buildContext(),
			payload: buildPayload(),
		});

		expect(mockState.batchCreateCalls).toHaveLength(1);
	});

	test("creates only the entities missing from a partially committed batch", async () => {
		mockState.existingEntities = [{ id: "entity_123", deleted: false }];

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

		expect(mockState.batchCreateCalls[0]?.createEntityData).toEqual([
			{ id: "entity_456", name: "Other", feature_id: "seats" },
		]);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			createdCount: 1,
			skippedCount: 1,
		});
	});

	test("treats an existing id-less entity on the feature as already created", async () => {
		mockState.existingEntities = [
			{ id: null, deleted: false, internal_feature_id: "if_seats" },
		];

		await replayFailedEntityCreation({
			ctx: buildContext(),
			payload: buildPayload({
				createEntityData: [{ id: null, name: "Entity", feature_id: "seats" }],
			}),
		});

		expect(mockState.batchCreateCalls).toHaveLength(0);
	});

	test("replays an id-less entity when the existing one belongs to another feature", async () => {
		mockState.existingEntities = [
			{ id: null, deleted: false, internal_feature_id: "if_workspaces" },
		];

		await replayFailedEntityCreation({
			ctx: buildContext(),
			payload: buildPayload({
				createEntityData: [{ id: null, name: "Entity", feature_id: "seats" }],
			}),
		});

		expect(mockState.batchCreateCalls).toHaveLength(1);
	});

	test.each(["seat_charge", "entities_committed"] as const)(
		"refuses automatic replay after a %s failure",
		async (failureStage) => {
			await expect(
				replayFailedEntityCreation({
					ctx: buildContext(),
					payload: buildPayload({ failureStage }),
				}),
			).rejects.toThrow("requires manual billing review");

			expect(mockState.batchCreateCalls).toHaveLength(0);
		},
	);
});
