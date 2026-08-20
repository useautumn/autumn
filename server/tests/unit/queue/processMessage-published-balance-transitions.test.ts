import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import { JobName } from "@/queue/JobName.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	createWorkerContextCalls: 0,
	persistenceCalls: [] as Record<string, unknown>[],
	persistenceError: undefined as Error | undefined,
};

await mockModuleWithRestore("@/queue/createWorkerContext.js", () => ({
	createWorkerContext: async () => {
		mockState.createWorkerContextCalls += 1;
		return undefined;
	},
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/publish/persistPublishedBalanceTransitions.js",
	() => ({
		persistPublishedBalanceTransitions: async (
			args: Record<string, unknown>,
		) => {
			mockState.persistenceCalls.push(args);
			if (mockState.persistenceError) throw mockState.persistenceError;
		},
	}),
);

const { processMessage, shouldRetrySqsJobError } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/queue/processMessage.js?publishedBalanceTransitions"
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

describe("published balance transition persistence jobs", () => {
	beforeEach(() => {
		mockState.createWorkerContextCalls = 0;
		mockState.persistenceCalls = [];
		mockState.persistenceError = undefined;
	});

	test("persists directly without creating a customer cache context", async () => {
		const payload = {
			orgId: "org_123",
			env: AppEnv.Sandbox,
			customerId: "customer_123",
			requestId: "req_123",
			balanceTransitions,
		};
		const message = {
			MessageId: "message_123",
			Body: JSON.stringify({
				name: JobName.PersistPublishedBalanceTransitions,
				data: payload,
			}),
		} satisfies Pick<Message, "MessageId" | "Body">;

		await processMessage({ message: message as Message, db: {} as never });

		expect(mockState.createWorkerContextCalls).toBe(0);
		expect(mockState.persistenceCalls).toHaveLength(1);
		expect(mockState.persistenceCalls[0]).toMatchObject({ balanceTransitions });
	});

	test("keeps any persistence failure in SQS for redelivery", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.PersistPublishedBalanceTransitions,
				error: new Error("database unavailable"),
			}),
		).toBe(true);
	});

	test("rethrows a worker persistence failure so SQS retains the message", async () => {
		mockState.persistenceError = new Error("database unavailable");
		const message = {
			MessageId: "message_123",
			Body: JSON.stringify({
				name: JobName.PersistPublishedBalanceTransitions,
				data: {
					orgId: "org_123",
					env: AppEnv.Sandbox,
					customerId: "customer_123",
					requestId: "req_123",
					balanceTransitions,
				},
			}),
		} satisfies Pick<Message, "MessageId" | "Body">;

		await expect(
			processMessage({ message: message as Message, db: {} as never }),
		).rejects.toThrow("database unavailable");
	});
});

afterAll(() => {
	mock.restore();
});
