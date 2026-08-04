/**
 * TDD contract for the shared creation recovery queue round trip.
 *
 * Contract under test:
 * - An entity capture lands on the customer creation recovery queue under the
 *   customer job name, so one drain switch and one FIFO group cover both.
 * - Draining that envelope replays the create with its original customer,
 *   entities, and API version.
 * - The drain routes on the payload: tagged entity captures reach entity replay,
 *   and untagged customer captures still reach customer replay.
 * - A capture that needs manual billing review is never replayed.
 */

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import type { EntityCreationRecoveryStage } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { queueFailedEntityCreation } from "@/internal/entities/recovery/queueFailedEntityCreation.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { JobName } from "@/queue/JobName.js";

const recoveryQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/customer-creation-recovery.fifo";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as SQSClient["send"] | null,
	batchCreateCalls: [] as Record<string, unknown>[],
	getOrCreateCustomerCalls: [] as Record<string, unknown>[],
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/internal/entities/actions/batchCreateEntities.js",
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js",
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

mock.module(
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js",
	() => ({
		getOrCreateApiCustomerByRollout: async (args: Record<string, unknown>) => {
			mockState.getOrCreateCustomerCalls.push(args);
			return { id: "customer_123" };
		},
	}),
);

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () => ({ id: "customer_123", entities: [] }),
	},
}));

const { replayCreationRecovery } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/recovery/replayCreationRecovery.js?creationRecoveryRoundtrip"
);

const buildRequestContext = () =>
	({
		id: "req_entity_123",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			info: mock(() => {}),
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const buildWorkerContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		features: [{ id: "seats", internal_id: "if_seats" }],
		// Workers start on the org's own version; replay restores the caller's.
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		skipCache: true,
		extraLogs: {},
		logger: {
			info: mock(() => {}),
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customer_id: "customer_123",
	create_entity_data: [
		{ id: "entity_123", name: "Entity", feature_id: "seats" },
	],
	customer_data: { email: "customer@example.com" },
};

const capture = async ({
	failureStage,
}: {
	failureStage: EntityCreationRecoveryStage;
}) => {
	const queued = await queueFailedEntityCreation({
		ctx: buildRequestContext(),
		params,
		source: "handleCreateEntityV2",
		withAutumnId: true,
		failureStage,
	});

	expect(queued).toBe(true);
	expect(mockState.queueCommands).toHaveLength(1);
	return JSON.parse(mockState.queueCommands[0]?.MessageBody as string);
};

const drain = async ({ envelope }: { envelope: { data: unknown } }) => {
	const ctx = buildWorkerContext();
	await replayCreationRecovery({ ctx, payload: envelope.data });
	return ctx;
};

describe("creation recovery round trip", () => {
	const originalQueueUrl = process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.batchCreateCalls = [];
		mockState.getOrCreateCustomerCalls = [];
		process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL = recoveryQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: recoveryQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
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

	test("replays a shed create from the envelope the capture wrote", async () => {
		const envelope = await capture({ failureStage: "lookup" });

		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: recoveryQueueUrl,
			MessageGroupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
		});
		expect(envelope.name).toBe(JobName.CustomerCreationRecovery);

		const workerCtx = await drain({ envelope });

		expect(mockState.getOrCreateCustomerCalls).toHaveLength(0);
		expect(mockState.batchCreateCalls).toEqual([
			expect.objectContaining({
				customerId: "customer_123",
				createEntityData: params.create_entity_data,
				customerData: params.customer_data,
				withAutumnId: true,
				source: "entityCreationRecovery",
				enqueueRecoveryOnTransientFailure: false,
			}),
		]);
		expect(workerCtx.apiVersion.value).toBe(ApiVersion.V2_1);
		expect(workerCtx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			sourceRequestId: "req_entity_123",
			failureStage: "lookup",
		});
	});

	test("still replays an untagged customer capture as a customer", async () => {
		// The only payload shape on this queue before entity captures joined it.
		await drain({
			envelope: {
				data: {
					orgId: "org_123",
					env: AppEnv.Live,
					customerId: "customer_123",
					requestId: "req_customer_123",
					apiVersion: ApiVersion.V2_1,
					params: { customer_id: "customer_123" },
					source: "handleGetOrCreateCustomerV2",
					failureStage: "lookup",
					failedAt: 1_785_000_000_000,
				},
			},
		});

		expect(mockState.batchCreateCalls).toHaveLength(0);
		expect(mockState.getOrCreateCustomerCalls).toEqual([
			expect.objectContaining({ source: "customerCreationRecovery" }),
		]);
	});

	test("refuses to replay a capture that needs manual billing review", async () => {
		const envelope = await capture({ failureStage: "seat_charge" });

		await expect(drain({ envelope })).rejects.toThrow(
			"requires manual billing review",
		);
		expect(mockState.batchCreateCalls).toHaveLength(0);
	});
});
