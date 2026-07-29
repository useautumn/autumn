/** Org-scoped V2 balance updates enqueue exact jobs while other orgs retain synchronous execution.
 * Enqueue delegates refresh to the worker; queue unavailability rejects before mutation. */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersionClass,
	AppEnv,
	LATEST_VERSION,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { AsyncBalanceUpdateConfigSchema } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateSchemas.js";
import { _setAsyncBalanceUpdateConfigForTesting } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { JobName } from "@/queue/JobName.js";

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

const state = {
	queueCommands: [] as Record<string, unknown>[],
	getFullSubjectCalls: [] as Record<string, unknown>[],
	updateRemainingCalls: [] as Record<string, unknown>[],
	originalSend: null as SQSClient["send"] | null,
};

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async (args: Record<string, unknown>) => {
			state.getFullSubjectCalls.push(args);
			return {
				customerId: args.customerId,
				entityId: args.entityId,
			};
		},
	}),
);

mock.module(
	"@/internal/balances/updateBalance/v2/updateRemainingV2.js",
	() => ({
		updateRemainingV2: async (args: Record<string, unknown>) => {
			state.updateRemainingCalls.push(args);
		},
	}),
);

mock.module("@/internal/balances/updateBalance/v2/updateUsageV2.js", () => ({
	updateUsageV2: async () => {},
}));

mock.module(
	"@/internal/balances/updateBalance/v2/updateIncludedGrantV2.js",
	() => ({ updateIncludedGrantV2: async () => {} }),
);

mock.module(
	"@/internal/balances/updateBalance/v2/updateNextResetAtV2.js",
	() => ({ updateNextResetAtV2: async () => {} }),
);

mock.module(
	"@/internal/balances/updateBalance/v2/updateExpiresAtV2.js",
	() => ({ updateExpiresAtV2: async () => {} }),
);

const { updateBalanceV2 } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/internal/balances/updateBalance/v2/updateBalanceV2.js?asyncUpdate"
);

const createCtx = () =>
	({
		id: "req_update_balance_123",
		org: { id: "org_123", slug: "test-org" },
		env: AppEnv.Sandbox,
		customerId: "cus_123",
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [],
		extraLogs: {},
		scopes: [],
		skipCache: false,
		logger: {
			warn: mock(() => {}),
			info: mock(() => {}),
			error: mock(() => {}),
			debug: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customer_id: "cus_123",
	feature_id: "messages",
	remaining: 40,
} satisfies UpdateBalanceParamsV0;

describe("updateBalanceV2 async routing", () => {
	const originalQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		state.queueCommands = [];
		state.getFullSubjectCalls = [];
		state.updateRemainingCalls = [];
		_setAsyncBalanceUpdateConfigForTesting({
			config: AsyncBalanceUpdateConfigSchema.parse({}),
		});
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		state.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			state.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (state.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = state.originalSend;
			state.originalSend = null;
		}
		_setAsyncBalanceUpdateConfigForTesting({
			config: AsyncBalanceUpdateConfigSchema.parse({}),
		});
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalQueueUrl;
	});

	test("enqueues configured async updates without running synchronous mutation helpers", async () => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["test-org"] },
		});
		const ctx = createCtx();

		await updateBalanceV2({ ctx, params, targetBalance: 40 });

		expect(state.queueCommands).toHaveLength(1);
		expect(state.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
			MessageGroupId: "org_123:sandbox:cus_123:none",
			MessageDeduplicationId: ctx.id,
		});
		const message = JSON.parse(
			String(state.queueCommands[0].MessageBody),
		) as Record<string, unknown>;
		expect(message).toMatchObject({
			name: JobName.UpdateBalance,
			data: {
				orgId: "org_123",
				env: AppEnv.Sandbox,
				customerId: "cus_123",
				requestId: ctx.id,
				params,
				targetBalance: 40,
			},
		});
		expect(state.getFullSubjectCalls).toHaveLength(0);
		expect(state.updateRemainingCalls).toHaveLength(0);
		expect(ctx.testOptions?.skipCacheDeletion).toBe(true);
	});

	test("keeps other org updates synchronous", async () => {
		const ctx = createCtx();
		await updateBalanceV2({
			ctx,
			params,
			targetBalance: 40,
		});

		expect(state.queueCommands).toHaveLength(0);
		expect(state.getFullSubjectCalls).toHaveLength(1);
		expect(state.updateRemainingCalls).toHaveLength(1);
		expect(ctx.testOptions?.skipCacheDeletion).toBeUndefined();
	});

	test("allows a non-production async balance update test option", async () => {
		const ctx = createCtx();
		ctx.testOptions = { asyncBalanceUpdate: true };

		await updateBalanceV2({ ctx, params, targetBalance: 40 });

		expect(state.queueCommands).toHaveLength(1);
		expect(state.getFullSubjectCalls).toHaveLength(0);
		expect(state.updateRemainingCalls).toHaveLength(0);
	});

	test("rejects before mutation when the async queue is unavailable", async () => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["org_123"] },
		});
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = undefined;

		await expect(
			updateBalanceV2({
				ctx: createCtx(),
				params,
				targetBalance: 40,
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(state.getFullSubjectCalls).toHaveLength(0);
		expect(state.updateRemainingCalls).toHaveLength(0);
	});
});
