/**
 * TDD contract for wiring entity creation overload failures to recovery.
 *
 * Contract under test:
 * - A transient failure is still returned as the existing overload 503.
 * - The normalized request is captured once with the execution stage at failure.
 * - A single entity payload is normalized to a list so replay has one shape.
 * - Non-transient application errors surface untouched and are never captured.
 * - Recovery workers can explicitly disable capture to prevent recursive enqueue.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setEntityCreationRecoveryStage } from "@/internal/entities/recovery/entityCreationRecoveryStage.js";

const transientError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
	failWith: transientError as unknown,
	stageAtFailure: undefined as
		| "entitlements_updating"
		| "seat_charge"
		| "entities_committed"
		| undefined,
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/internal/entities/handlers/handleCreateEntity/getInputEntities.js",
	"@/internal/entities/recovery/queueFailedEntityCreation.js",
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

mock.module(
	"@/internal/entities/handlers/handleCreateEntity/getInputEntities.js",
	() => ({
		validateAndGetInputEntities: async ({ ctx }: { ctx: AutumnContext }) => {
			if (mockState.stageAtFailure) {
				setEntityCreationRecoveryStage({
					ctx,
					stage: mockState.stageAtFailure,
				});
			}
			throw mockState.failWith;
		},
	}),
);

mock.module(
	"@/internal/entities/recovery/queueFailedEntityCreation.js",
	() => ({
		queueFailedEntityCreation: async (args: Record<string, unknown>) => {
			mockState.queueCalls.push(args);
			return true;
		},
	}),
);

const { batchCreateEntities } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/actions/batchCreateEntities.js?entityCreationCapture"
);

const buildContext = () =>
	({
		id: "req_entity_123",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const createEntityData = [
	{ id: "entity_123", name: "Entity", feature_id: "seats" },
];
const customerData = { email: "customer@example.com" };

describe("batchCreateEntities recovery capture", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
		mockState.failWith = transientError;
		mockState.stageAtFailure = undefined;
	});

	test("captures the normalized request while preserving overload response semantics", async () => {
		const ctx = buildContext();

		await expect(
			batchCreateEntities({
				ctx,
				customerId: "customer_123",
				createEntityData,
				customerData,
				withAutumnId: true,
				source: "handleCreateEntityV2",
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});

		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({
				ctx,
				params: {
					customer_id: "customer_123",
					create_entity_data: createEntityData,
					customer_data: customerData,
				},
				source: "handleCreateEntityV2",
				withAutumnId: true,
				failureStage: "lookup",
			}),
		]);
	});

	test("normalizes a single entity request into a replayable list", async () => {
		await expect(
			batchCreateEntities({
				ctx: buildContext(),
				customerId: "customer_123",
				createEntityData: createEntityData[0],
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(mockState.queueCalls[0]?.params).toMatchObject({
			create_entity_data: [createEntityData[0]],
		});
	});

	test.each([
		"entitlements_updating",
		"seat_charge",
		"entities_committed",
	] as const)(
		"records %s as the stage reached before the failure",
		async (stage) => {
			mockState.stageAtFailure = stage;

			await expect(
				batchCreateEntities({
					ctx: buildContext(),
					customerId: "customer_123",
					createEntityData,
				}),
			).rejects.toMatchObject({ statusCode: 503 });

			expect(mockState.queueCalls[0]).toMatchObject({ failureStage: stage });
		},
	);

	test("leaves application errors untouched and uncaptured", async () => {
		mockState.failWith = new RecaseError({
			message: "Entity with id entity_123 already exists",
			statusCode: 409,
		});

		await expect(
			batchCreateEntities({
				ctx: buildContext(),
				customerId: "customer_123",
				createEntityData,
			}),
		).rejects.toMatchObject({ statusCode: 409 });

		expect(mockState.queueCalls).toHaveLength(0);
	});

	test("does not recursively capture a recovery replay", async () => {
		await expect(
			batchCreateEntities({
				ctx: buildContext(),
				customerId: "customer_123",
				createEntityData,
				source: "entityCreationRecovery",
				enqueueRecoveryOnTransientFailure: false,
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(mockState.queueCalls).toHaveLength(0);
	});
});
