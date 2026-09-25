/** Org-scoped V2 balance updates enqueue exact jobs while other orgs retain synchronous execution.
 * Enqueue delegates refresh to the worker; queue unavailability rejects before mutation. */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersionClass,
	AppEnv,
	ErrCode,
	type Feature,
	FeatureType,
	LATEST_VERSION,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { AsyncBalanceUpdateConfigSchema } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateSchemas.js";
import { _setAsyncBalanceUpdateConfigForTesting } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { JobName } from "@/queue/JobName.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";
const trackAsyncStandardQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev-standard";
const updateBalanceQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/update-balance-dev.fifo";

const state = {
	queueCommands: [] as Record<string, unknown>[],
	getFullSubjectCalls: [] as Record<string, unknown>[],
	updateRemainingCalls: [] as Record<string, unknown>[],
	originalSend: null as SQSClient["send"] | null,
	subjectProducts: [] as Record<string, unknown>[],
	workerRollout: false,
	queuedWorkerCommands: [] as unknown[],
};

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async (args: Record<string, unknown>) => {
			state.getFullSubjectCalls.push(args);
			return {
				customerId: args.customerId,
				entityId: args.entityId,
				customer_products: state.subjectProducts,
				extra_customer_entitlements: [],
				pooled_customer_entitlements: [],
			};
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateRemainingV2.js",
	() => ({
		updateRemainingV2: async (args: Record<string, unknown>) => {
			state.updateRemainingCalls.push(args);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateUsageV2.js",
	() => ({
		updateUsageV2: async () => {},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateIncludedGrantV2.js",
	() => ({ updateIncludedGrantV2: async () => {} }),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateNextResetAtV2.js",
	() => ({ updateNextResetAtV2: async () => {} }),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateExpiresAtV2.js",
	() => ({ updateExpiresAtV2: async () => {} }),
);

// Off by default: the legacy lane is what most cases pin; the worker lane has its own suites.
await mockModuleWithRestore(
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	() => ({ isBalanceWorkerRolloutEnabled: () => state.workerRollout }),
);

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	() => ({
		getBalanceWorkerClient: () => ({
			queue: {
				updateBalance: async ({ commands }: { commands: unknown[] }) => {
					state.queuedWorkerCommands.push(...commands);
				},
			},
		}),
	}),
);

const { runUpdateBalanceV2, updateBalanceV2 } = await import(
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

const invoiceCreditFeature = {
	id: "invoice_credits",
	type: FeatureType.CreditSystem,
	config: { invoice_credit: true },
} as Feature;

const createInvoiceCreditCtx = () => {
	const ctx = createCtx();
	ctx.features = [invoiceCreditFeature];
	return ctx;
};

/** A plain live balance for the feature the routing params name, so the
 *  routing assertions aren't answered by the "no such balance" guard. */
const messagesProducts = () => [
	{
		status: "active",
		customer_entitlements: [
			{
				id: "ce_messages",
				invoice_credit: false,
				pooled_contribution_id: null,
				is_pooled_balance: false,
				balance: 100,
				entitlement: { feature: { id: "messages" } },
			},
		],
	},
];

/** A subject whose credits balance was stamped as invoice credits at attach. */
const stampedInvoiceCreditProducts = () => [
	{
		status: "active",
		customer_entitlements: [
			{
				id: "ce_invoice_credits",
				invoice_credit: true,
				pooled_contribution_id: null,
				is_pooled_balance: false,
				entitlement: { feature: invoiceCreditFeature },
			},
		],
	},
];

describe("updateBalanceV2 async routing", () => {
	const originalQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
	const originalStandardQueueUrl =
		process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	const originalUpdateBalanceQueueUrl =
		process.env.UPDATE_BALANCE_SQS_QUEUE_URL;

	beforeEach(() => {
		state.queueCommands = [];
		state.getFullSubjectCalls = [];
		state.updateRemainingCalls = [];
		state.subjectProducts = [];
		state.workerRollout = false;
		state.queuedWorkerCommands = [];
		_setAsyncBalanceUpdateConfigForTesting({
			config: AsyncBalanceUpdateConfigSchema.parse({}),
		});
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;
		process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = trackAsyncStandardQueueUrl;
		process.env.UPDATE_BALANCE_SQS_QUEUE_URL = updateBalanceQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: updateBalanceQueueUrl });
		state.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			state.queueCommands.push(command.input);
			const entries =
				(command.input.Entries as Array<{ Id?: string }> | undefined) ?? [];
			return {
				Successful: entries.map((entry) => ({ Id: entry.Id })),
			};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (state.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: updateBalanceQueueUrl });
			sqsClient.send = state.originalSend;
			state.originalSend = null;
		}
		_setAsyncBalanceUpdateConfigForTesting({
			config: AsyncBalanceUpdateConfigSchema.parse({}),
		});
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalQueueUrl;
		process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = originalStandardQueueUrl;
		process.env.UPDATE_BALANCE_SQS_QUEUE_URL = originalUpdateBalanceQueueUrl;
	});

	test("on the worker path, an async update is a queued command, not an SQS job", async () => {
		state.workerRollout = true;
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["test-org"] },
		});
		const ctx = createCtx();
		ctx.org = {
			...ctx.org,
			config: {
				reverse_deduction_order: false,
				block_overdue_entitlements: false,
				include_past_due: true,
			},
		} as AutumnContext["org"];
		ctx.features = [
			{ id: "messages", internal_id: "feat_messages" } as Feature,
		];

		await updateBalanceV2({ ctx, params, targetBalance: 40 });

		expect(state.queueCommands).toHaveLength(0);
		expect(state.queuedWorkerCommands).toEqual([
			expect.objectContaining({
				type: "updateBalance",
				commandId: ctx.id,
				featureId: "messages",
				remaining: 40,
			}),
		]);
		expect(state.getFullSubjectCalls).toHaveLength(0);
		expect(ctx.testOptions?.skipCacheDeletion).toBe(true);
	});

	test("enqueues configured async updates without running synchronous mutation helpers", async () => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["test-org"] },
		});
		const ctx = createCtx();

		await updateBalanceV2({ ctx, params, targetBalance: 40 });

		expect(state.queueCommands).toHaveLength(1);
		expect(state.queueCommands[0]).toMatchObject({
			QueueUrl: updateBalanceQueueUrl,
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
		state.subjectProducts = messagesProducts();
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
		process.env.UPDATE_BALANCE_SQS_QUEUE_URL = undefined;

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

	test("enqueues flagged-feature mutations without consulting the catalog; the worker decides", async () => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["test-org"] },
		});

		await updateBalanceV2({
			ctx: createInvoiceCreditCtx(),
			params: {
				customer_id: "cus_123",
				feature_id: invoiceCreditFeature.id,
				usage: 60,
			},
		});

		expect(state.queueCommands).toHaveLength(1);
		expect(state.getFullSubjectCalls).toHaveLength(0);
		expect(state.updateRemainingCalls).toHaveLength(0);
	});

	test("the worker core rejects mutations of a balance stamped as invoice credits", async () => {
		state.subjectProducts = stampedInvoiceCreditProducts();

		for (const mutation of [
			{ remaining: 40 },
			{ add_to_balance: 10 },
			{ add_to_balance: -10 },
			{ usage: 60 },
			{ included_grant: 100 },
		] satisfies Partial<UpdateBalanceParamsV0>[]) {
			await expect(
				runUpdateBalanceV2({
					ctx: createInvoiceCreditCtx(),
					params: {
						customer_id: "cus_123",
						feature_id: invoiceCreditFeature.id,
						...mutation,
					},
					targetBalance: mutation.remaining,
				}),
			).rejects.toMatchObject({
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		expect(state.updateRemainingCalls).toHaveLength(0);
	});

	test("the worker core allows mutations when the flagged feature's balance is not stamped", async () => {
		state.subjectProducts = [
			{
				status: "active",
				customer_entitlements: [
					{
						id: "ce_plain_credits",
						invoice_credit: false,
						pooled_contribution_id: null,
						is_pooled_balance: false,
						entitlement: { feature: invoiceCreditFeature },
					},
				],
			},
		];

		await runUpdateBalanceV2({
			ctx: createInvoiceCreditCtx(),
			params: {
				customer_id: "cus_123",
				feature_id: invoiceCreditFeature.id,
				remaining: 40,
			},
			targetBalance: 40,
		});

		expect(state.updateRemainingCalls).toHaveLength(1);
	});

	test("the worker core scopes the guard to the balance the request names", async () => {
		state.subjectProducts = [
			{
				status: "active",
				customer_entitlements: [
					...stampedInvoiceCreditProducts()[0].customer_entitlements,
					{
						id: "ce_plain_credits",
						invoice_credit: false,
						pooled_contribution_id: null,
						is_pooled_balance: false,
						entitlement: { feature: invoiceCreditFeature },
					},
				],
			},
		];

		await runUpdateBalanceV2({
			ctx: createInvoiceCreditCtx(),
			params: {
				customer_id: "cus_123",
				feature_id: invoiceCreditFeature.id,
				balance_id: "ce_plain_credits",
				remaining: 40,
			},
			targetBalance: 40,
		});

		expect(state.updateRemainingCalls).toHaveLength(1);
	});

	test("allows metadata-only invoice-credit updates", async () => {
		await runUpdateBalanceV2({
			ctx: createInvoiceCreditCtx(),
			params: {
				customer_id: "cus_123",
				feature_id: invoiceCreditFeature.id,
				next_reset_at: Date.now() + 60_000,
			},
		});

		expect(state.getFullSubjectCalls).toHaveLength(1);
		expect(state.updateRemainingCalls).toHaveLength(0);
	});
});
