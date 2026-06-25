import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ApiVersion } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import { JobName } from "@/queue/JobName.js";

const mockState = {
	createWorkerContextCalls: [] as Record<string, unknown>[],
};

mock.module("@/queue/createWorkerContext.js", () => ({
	createWorkerContext: async (args: Record<string, unknown>) => {
		mockState.createWorkerContextCalls.push(args);
		const logger = {
			child: mock(() => logger),
			error: mock(() => {}),
		};
		return {
			logger,
			skipCache: args.skipCache ?? true,
			extraLogs: {},
		};
	},
}));

const { processMessage } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/queue/processMessage.js?trackSkipCache"
);

describe("processMessage track jobs", () => {
	beforeEach(() => {
		mockState.createWorkerContextCalls = [];
	});

	test("creates a Redis-capable worker context for queued track replay", async () => {
		const message = {
			MessageId: "msg_123",
			Body: JSON.stringify({
				name: JobName.Track,
				data: {
					orgId: "org_123",
					env: AppEnv.Sandbox,
					customerId: "cus_123",
					requestId: "req_123",
					apiVersion: ApiVersion.V2_1,
					body: {
						customer_id: "cus_123",
						feature_id: "usage_in_usd",
						value: 1,
						async: true,
					},
				},
			}),
		} satisfies Pick<Message, "MessageId" | "Body">;

		await processMessage({ message: message as Message, db: {} as never });

		expect(mockState.createWorkerContextCalls).toHaveLength(1);
		expect(mockState.createWorkerContextCalls[0]).toMatchObject({
			payload: expect.objectContaining({ requestId: "req_123" }),
			skipCache: false,
		});
	});
});
