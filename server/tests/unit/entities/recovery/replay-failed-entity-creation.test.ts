/**
 * TDD contract for entity creation recovery replay.
 *
 * Contract under test:
 * - A replay re-runs the public batch create with the original API version and cannot
 *   enqueue itself again.
 * - An entity the original request did land is a successful replay, not a 409.
 * - Replays log whether they created the entities or found them.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	EntityAlreadyExistsError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { EntityCreationRecoveryPayload } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const mockState = {
	batchCreateCalls: [] as Record<string, unknown>[],
	batchCreateFailure: undefined as unknown,
};

await mockModuleWithRestore(
	"@/internal/entities/actions/batchCreateEntities.js",
	() => ({
		batchCreateEntities: async (args: Record<string, unknown>) => {
			mockState.batchCreateCalls.push(args);
			if (mockState.batchCreateFailure) throw mockState.batchCreateFailure;
			return [{ id: "entity_123" }];
		},
	}),
);

const { replayFailedEntityCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/recovery/replayFailedEntityCreation.js?entityCreationRecovery"
);

const buildContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		extraLogs: {},
		logger: {
			info: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const payload: EntityCreationRecoveryPayload = {
	orgId: "org_123",
	env: AppEnv.Live,
	customerId: "customer_123",
	requestId: "req_entity_123",
	apiVersion: ApiVersion.V2_1,
	params: {
		customerId: "customer_123",
		createEntityData: [{ id: "entity_123", name: null, feature_id: "seats" }],
	},
	failedAt: 1_785_000_000_000,
};

describe("replayFailedEntityCreation", () => {
	beforeEach(() => {
		mockState.batchCreateCalls = [];
		mockState.batchCreateFailure = undefined;
	});

	test("replays the create through the public action with its original API semantics", async () => {
		const ctx = buildContext();

		await replayFailedEntityCreation({ ctx, payload });

		expect(ctx.apiVersion.value).toBe(ApiVersion.V2_1);
		expect(mockState.batchCreateCalls).toEqual([
			expect.objectContaining({
				ctx,
				...payload.params,
				enqueueRecoveryOnTransientFailure: false,
			}),
		]);
		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			sourceRequestId: "req_entity_123",
		});
	});

	test("treats an entity the original request landed as a successful replay", async () => {
		mockState.batchCreateFailure = new EntityAlreadyExistsError({
			entityId: "entity_123",
		});
		const ctx = buildContext();

		await replayFailedEntityCreation({ ctx, payload });

		expect(ctx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "existing",
		});
	});

	test("propagates any other verdict so the queue's retry policy decides", async () => {
		mockState.batchCreateFailure = new Error("Customer not found");

		await expect(
			replayFailedEntityCreation({ ctx: buildContext(), payload }),
		).rejects.toThrow("Customer not found");
	});
});
