/**
 * TDD contract for entity creation recovery replay.
 *
 * Contract under test:
 * - A capture replays the original normalized create with its API semantics.
 * - Replay never re-bills: the shed request may already have invoiced a seat,
 *   and a proration cannot be detected after the fact.
 * - Replays cannot enqueue themselves again.
 * - Entities that landed before the drain reached them surface as an
 *   already-exists conflict, which is the no-op signal rather than a failure.
 * - A shed replay stays in SQS; anything else logs what it could not recreate
 *   before the worker drops the message.
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
	createFailsWith: undefined as unknown,
	existingEntities: [] as Record<string, unknown>[],
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/internal/entities/actions/batchCreateEntities.js",
	"@/internal/customers/CusService.js",
	"@/internal/api/entities/EntityService.js",
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
		if (mockState.createFailsWith) throw mockState.createFailsWith;
		return [];
	},
}));

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		get: async () => ({ id: "customer_123", internal_id: "icus_123" }),
	},
}));

mock.module("@/internal/api/entities/EntityService.js", () => ({
	EntityService: {
		get: async ({ id }: { id: string }) =>
			mockState.existingEntities.find((entity) => entity.id === id),
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
	source: "handleCreateEntityV2",
	withAutumnId: true,
	mayHaveWritten,
	failedAt: 1_785_000_000_000,
});

describe("replayFailedEntityCreation", () => {
	beforeEach(() => {
		mockState.batchCreateCalls = [];
		mockState.createFailsWith = undefined;
		mockState.existingEntities = [];
	});

	test("replays the request with its original API semantics and no seat charge", async () => {
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
				// The shed request may already have invoiced this seat, and nothing
				// downstream can tell whether it did.
				skipSeatCharge: true,
			}),
		]);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			sourceRequestId: "req_entity_123",
			customerId: "customer_123",
			entities: [{ id: "entity_123", feature_id: "seats" }],
		});
	});

	test("treats an already-exists conflict as the request having landed", async () => {
		mockState.existingEntities = [{ id: "entity_123" }];
		mockState.createFailsWith = new RecaseError({
			message: "Entity entity_123 already exists",
			code: EntityErrorCode.EntityAlreadyExists,
			statusCode: 409,
		});
		const ctx = buildContext();

		await replayFailedEntityCreation({ ctx, payload: buildPayload() });

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "already_exists",
			sourceRequestId: "req_entity_123",
		});
	});

	test("names what stayed uncreated when only part of the batch conflicted", async () => {
		// Something else created entity_123 between the capture and the drain, so
		// the batch cannot go in whole and entity_456 has nowhere to be created.
		mockState.existingEntities = [{ id: "entity_123" }];
		mockState.createFailsWith = new RecaseError({
			message: "Entity entity_123 already exists",
			code: EntityErrorCode.EntityAlreadyExists,
			statusCode: 409,
		});
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
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("logs what it could not recreate when the replay is rejected", async () => {
		mockState.createFailsWith = new RecaseError({
			message: "Feature limit reached",
			statusCode: 400,
		});
		const ctx = buildContext();

		await expect(
			replayFailedEntityCreation({ ctx, payload: buildPayload() }),
		).rejects.toMatchObject({ statusCode: 400 });

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "rejected",
			sourceRequestId: "req_entity_123",
			customerId: "customer_123",
			entities: [{ id: "entity_123", feature_id: "seats" }],
		});
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("leaves a shed replay to redelivery rather than calling it rejected", async () => {
		mockState.createFailsWith = new RecaseError({
			message: "Service is temporarily unavailable, please retry shortly.",
			code: "service_unavailable",
			statusCode: 503,
		});
		const ctx = buildContext();

		await expect(
			replayFailedEntityCreation({ ctx, payload: buildPayload() }),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toBeUndefined();
	});
	test("refuses to replay a capture that may already have written", async () => {
		const ctx = buildContext();

		await expect(
			replayFailedEntityCreation({
				ctx,
				payload: buildPayload({ mayHaveWritten: true }),
			}),
		).rejects.toThrow("requires manual review");

		// A decremented balance and an entity whose defaults never attached are both
		// invisible to a later read, so replaying would double-apply them.
		expect(mockState.batchCreateCalls).toHaveLength(0);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "manual_review",
			sourceRequestId: "req_entity_123",
		});
	});

	test("never reports an id-less entity as confirmed created", async () => {
		mockState.existingEntities = [{ id: "entity_123" }];
		mockState.createFailsWith = new RecaseError({
			message: "Entity entity_123 already exists",
			code: EntityErrorCode.EntityAlreadyExists,
			statusCode: 409,
		});
		const ctx = buildContext();

		await replayFailedEntityCreation({
			ctx,
			payload: buildPayload({
				createEntityData: [
					{ id: "entity_123", name: "Entity", feature_id: "seats" },
					{ id: null, name: "Placeholder", feature_id: "seats" },
				],
			}),
		});

		// It has no id to match on, so acking the batch would silently drop it.
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "partially_created",
			unconfirmed: [{ id: null, feature_id: "seats" }],
		});
	});
});
