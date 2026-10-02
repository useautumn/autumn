/**
 * TDD contract for durable entities.create failure capture.
 *
 * Contract under test:
 * - Transient failures are sent as the entity creation recovery job, on the customer creation
 *   recovery queue.
 * - Payloads preserve org, environment, API version, the validated create params, and request ID.
 * - Identical recovery requests share a deterministic deduplication ID.
 * - The message group is the subject: an entity replay lands after any customer creation
 *   queued for the same customer, beside other customers' replays.
 * - A send the queue could not make never replaces the original API failure.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SendOptions } from "@autumn/sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const mockState = {
	sends: [] as { payload: Record<string, unknown>; options?: SendOptions }[],
	shouldFailSend: false,
};

await mockModuleWithRestore("@/queue/getSqsJobs.js", () => ({
	getSqsJobs: () => ({
		entityCreationRecovery: {
			trySend: async (
				payload: Record<string, unknown>,
				options?: SendOptions,
			) => {
				mockState.sends.push({ payload, options });
				return mockState.shouldFailSend
					? { sent: false, error: new Error("SQS unavailable") }
					: { sent: true };
			},
		},
	}),
}));

const { queueFailedEntityCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/recovery/queueFailedEntityCreation.js?entityCreationQueue"
);

const buildContext = () =>
	({
		id: "req_entity_123",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			error: mock(() => {}),
			warn: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customerId: "customer_123",
	customerData: { email: "customer@example.com", name: "Customer" },
	createEntityData: [{ id: "entity_123", name: "Entity", feature_id: "seats" }],
	withAutumnId: true,
};

describe("queueFailedEntityCreation", () => {
	beforeEach(() => {
		mockState.sends = [];
		mockState.shouldFailSend = false;
	});

	test("sends a replayable request with deterministic deduplication", async () => {
		const firstQueued = await queueFailedEntityCreation({
			ctx: buildContext(),
			params,
		});
		const secondQueued = await queueFailedEntityCreation({
			ctx: buildContext(),
			params,
		});

		expect(firstQueued).toBe(true);
		expect(secondQueued).toBe(true);
		expect(mockState.sends).toHaveLength(2);
		expect(mockState.sends[0]?.options?.groupId).toBe(
			"org_123:live:customer_123",
		);
		expect(mockState.sends[0]?.options?.dedupeId).toStartWith(
			"entity-creation-",
		);
		expect(mockState.sends[0]?.options?.dedupeId).toBe(
			mockState.sends[1]?.options?.dedupeId,
		);

		expect(mockState.sends[0]?.payload).toMatchObject({
			orgId: "org_123",
			env: AppEnv.Live,
			customerId: "customer_123",
			requestId: "req_entity_123",
			apiVersion: ApiVersion.V2_1,
			params,
		});
		expect(JSON.stringify(mockState.sends[0]?.payload)).not.toContain("apiKey");
		expect(JSON.stringify(mockState.sends[0]?.payload)).not.toContain(
			"secretKey",
		);
	});

	test("returns false without throwing when the send fails", async () => {
		mockState.shouldFailSend = true;
		const ctx = buildContext();

		const queued = await queueFailedEntityCreation({ ctx, params });

		expect(queued).toBe(false);
		expect(ctx.extraLogs.entityCreationRecoveryQueued).toBeUndefined();
	});
});
