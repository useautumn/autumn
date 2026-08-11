/**
 * TDD contract for durable entity creation failure capture.
 *
 * Contract under test:
 * - Transient failures are written to the customer creation recovery queue
 *   without API credentials, tagged so the worker can tell the two apart.
 * - Payloads preserve org, environment, API version, normalized request, and request ID.
 * - Identical recovery requests share a deterministic deduplication ID, and
 *   entity IDs cannot collide with customer IDs on the shared queue.
 * - Every message uses one global message group so replay has a hard concurrency ceiling of one.
 * - Missing or unavailable recovery infrastructure never replaces the original API failure.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { queueFailedEntityCreation } from "@/internal/entities/recovery/queueFailedEntityCreation.js";
import { getSqsClient } from "@/queue/initSqs.js";

const recoveryQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/customer-creation-recovery.fifo";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as SQSClient["send"] | null,
	shouldFailSend: false,
};

const buildContext = ({ id = "req_entity_123" }: { id?: string } = {}) =>
	({
		id,
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
	create_entity_data: [
		{
			id: "entity_123",
			name: "Entity",
			feature_id: "seats",
		},
	],
	customer_data: {
		email: "customer@example.com",
		name: "Customer",
	},
};

describe("queueFailedEntityCreation", () => {
	const originalQueueUrl = process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.shouldFailSend = false;
		process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL = recoveryQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: recoveryQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			if (mockState.shouldFailSend) throw new Error("SQS unavailable");
			return {};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			getSqsClient({ queueUrl: recoveryQueueUrl }).send =
				mockState.originalSend;
		}
		process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL = originalQueueUrl;
	});

	test("stores a replayable, serialized request with deterministic ordering and deduplication", async () => {
		const firstContext = buildContext();
		const secondContext = buildContext();

		const firstQueued = await queueFailedEntityCreation({
			ctx: firstContext,
			params,
			mayHaveWritten: false,
			source: "handleCreateEntityV2",
			withAutumnId: true,
		});
		const secondQueued = await queueFailedEntityCreation({
			ctx: secondContext,
			params,
			mayHaveWritten: false,
			source: "handleCreateEntityV2",
			withAutumnId: true,
		});

		expect(firstQueued).toBe(true);
		expect(secondQueued).toBe(true);
		expect(mockState.queueCommands).toHaveLength(2);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: recoveryQueueUrl,
			MessageGroupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
		});
		expect(mockState.queueCommands[0]?.MessageDeduplicationId).toBe(
			mockState.queueCommands[1]?.MessageDeduplicationId,
		);

		const queuedMessage = JSON.parse(
			mockState.queueCommands[0]?.MessageBody as string,
		);
		expect(queuedMessage).toMatchObject({
			name: "customer-creation-recovery",
			data: {
				kind: "entity",
				orgId: "org_123",
				env: AppEnv.Live,
				customerId: "customer_123",
				requestId: "req_entity_123",
				apiVersion: ApiVersion.V2_1,
				params,
				source: "handleCreateEntityV2",
				withAutumnId: true,
			},
		});
		expect(JSON.stringify(queuedMessage)).not.toContain("apiKey");
		expect(JSON.stringify(queuedMessage)).not.toContain("secretKey");
	});

	test("namespaces its deduplication id away from customer captures", async () => {
		await queueFailedEntityCreation({
			ctx: buildContext(),
			params,
			mayHaveWritten: false,
		});

		expect(mockState.queueCommands[0]?.MessageDeduplicationId).toMatch(
			/^entity-creation-/,
		);
	});

	test("returns false without masking the request when the queue is not configured", async () => {
		process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL = undefined;
		const ctx = buildContext();

		const queued = await queueFailedEntityCreation({
			ctx,
			params,
			mayHaveWritten: false,
			source: "handleCreateEntityV2",
		});

		expect(queued).toBe(false);
		expect(mockState.queueCommands).toHaveLength(0);
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("returns false without throwing when SQS is unavailable", async () => {
		mockState.shouldFailSend = true;
		const ctx = buildContext();

		const queued = await queueFailedEntityCreation({
			ctx,
			params,
			mayHaveWritten: false,
			source: "handleCreateEntityV2",
		});

		expect(queued).toBe(false);
		expect(ctx.logger.error).toHaveBeenCalled();
	});
});
