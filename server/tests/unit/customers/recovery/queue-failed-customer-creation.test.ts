/**
 * TDD contract for durable customer get-or-create failure capture.
 *
 * Contract under test:
 * - Transient failures are sent as the customer creation recovery job, without API credentials.
 * - Payloads preserve org, environment, API version, normalized request, stage, and request ID.
 * - Identical recovery requests share a deterministic deduplication ID.
 * - The message group is the subject, so one customer's replays stay in failure order while
 *   other customers replay in parallel.
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
		customerCreationRecovery: {
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

const { queueFailedCustomerCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/recovery/queueFailedCustomerCreation.js?customerCreationQueue"
);

const buildContext = () =>
	({
		id: "req_customer_123",
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
	customer_id: "customer_123",
	customer_data: {
		email: "customer@example.com",
		name: "Customer",
	},
	entity_id: "entity_123",
	entity_data: {
		name: "Entity",
		feature_id: "seats",
	},
};

describe("queueFailedCustomerCreation", () => {
	beforeEach(() => {
		mockState.sends = [];
		mockState.shouldFailSend = false;
	});

	test("sends a replayable request with deterministic ordering and deduplication", async () => {
		const firstQueued = await queueFailedCustomerCreation({
			ctx: buildContext(),
			params,
			source: "handleGetOrCreateCustomerV2",
			withAutumnId: true,
			failureStage: "lookup",
		});
		const secondQueued = await queueFailedCustomerCreation({
			ctx: buildContext(),
			params,
			source: "handleGetOrCreateCustomerV2",
			withAutumnId: true,
			failureStage: "lookup",
		});

		expect(firstQueued).toBe(true);
		expect(secondQueued).toBe(true);
		expect(mockState.sends).toHaveLength(2);
		expect(mockState.sends[0]?.options?.groupId).toBe(
			"org_123:live:customer_123",
		);
		expect(mockState.sends[0]?.options?.dedupeId).toStartWith(
			"customer-creation-",
		);
		expect(mockState.sends[0]?.options?.dedupeId).toBe(
			mockState.sends[1]?.options?.dedupeId,
		);

		expect(mockState.sends[0]?.payload).toMatchObject({
			orgId: "org_123",
			env: AppEnv.Live,
			customerId: "customer_123",
			requestId: "req_customer_123",
			apiVersion: ApiVersion.V2_1,
			params,
			source: "handleGetOrCreateCustomerV2",
			withAutumnId: true,
			failureStage: "lookup",
		});
		expect(JSON.stringify(mockState.sends[0]?.payload)).not.toContain("apiKey");
		expect(JSON.stringify(mockState.sends[0]?.payload)).not.toContain(
			"secretKey",
		);
	});

	test("returns false without throwing when the send fails", async () => {
		mockState.shouldFailSend = true;
		const ctx = buildContext();

		const queued = await queueFailedCustomerCreation({
			ctx,
			params,
			source: "handleGetOrCreateCustomerV2",
			failureStage: "lookup",
		});

		expect(queued).toBe(false);
		expect(ctx.extraLogs.customerCreationRecoveryQueued).toBeUndefined();
	});
});
