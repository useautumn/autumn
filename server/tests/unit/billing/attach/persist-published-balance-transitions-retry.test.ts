import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const queuedTasks: Record<string, unknown>[] = [];
const calls: string[] = [];
const persistenceError = Object.assign(new Error("database unavailable"), {
	code: "CONNECT_TIMEOUT",
});
let queueError: Error | undefined;

await mockModuleWithRestore("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (task: Record<string, unknown>) => {
		calls.push("queue");
		if (queueError) throw queueError;
		queuedTasks.push(task);
	},
}));

const { persistOrQueuePublishedBalanceTransitions } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/billing/v2/publish/persistPublishedBalanceTransitions.js?retry"
);

const balanceTransitions = [
	{
		customerEntitlementId: "entitlement_b",
		expected: {
			balance: 195,
			adjustment: 0,
			additionalBalance: 0,
			cacheVersion: 0,
			nextResetAt: null,
		},
		published: {
			balance: 190,
			adjustment: 0,
			additionalBalance: 0,
			cacheVersion: 0,
			nextResetAt: null,
		},
	},
];

const ctx = {
	db: {
		execute: async () => {
			calls.push("persist");
			throw persistenceError;
		},
	},
	logger: {
		warn: mock(() => {}),
		error: mock(() => {
			calls.push("error");
		}),
	},
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	id: "req_123",
} as unknown as AutumnContext;

beforeEach(() => {
	queuedTasks.length = 0;
	calls.length = 0;
	queueError = undefined;
});

test("logs a simultaneous queue failure without retrying the completed attach", async () => {
	queueError = new Error("queue unavailable");

	await expect(
		persistOrQueuePublishedBalanceTransitions({
			ctx,
			customerId: "customer_123",
			balanceTransitions,
		}),
	).resolves.toBeUndefined();

	expect(ctx.logger.error).toHaveBeenCalledTimes(1);
	expect(ctx.logger.error).toHaveBeenCalledWith(
		{
			error_type: "published_balance_persist_and_enqueue_failed",
			persistenceError,
			queueError,
		},
		"[persistPublishedBalanceTransitions] Failed to persist or queue the published balance",
	);
	expect(calls).toEqual(["persist", "queue", "error"]);
	expect(ctx.logger.warn).not.toHaveBeenCalled();
});

test("queues the exact guarded persistence after the immediate write fails", async () => {
	await persistOrQueuePublishedBalanceTransitions({
		ctx,
		customerId: "customer_123",
		balanceTransitions,
	});

	expect(queuedTasks).toEqual([
		{
			jobName: JobName.PersistPublishedBalanceTransitions,
			payload: {
				orgId: "org_123",
				env: AppEnv.Sandbox,
				customerId: "customer_123",
				requestId: "req_123",
				balanceTransitions,
			},
			messageGroupId: "org_123:sandbox:customer_123",
		},
	]);
});

afterAll(() => {
	mock.restore();
});
