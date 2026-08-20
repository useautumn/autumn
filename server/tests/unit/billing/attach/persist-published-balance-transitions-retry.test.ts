import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const queuedTasks: Record<string, unknown>[] = [];
let queueError: Error | undefined;

await mockModuleWithRestore("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (task: Record<string, unknown>) => {
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
			throw Object.assign(new Error("database unavailable"), {
				code: "CONNECT_TIMEOUT",
			});
		},
	},
	logger: {
		warn: mock(() => {}),
		error: mock(() => {}),
	},
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	id: "req_123",
} as unknown as AutumnContext;

beforeEach(() => {
	queuedTasks.length = 0;
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
