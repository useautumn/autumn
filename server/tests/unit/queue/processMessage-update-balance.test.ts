/** Deferred update-balance jobs execute through the V2 core without invalidating its cached subject.
 * Transient database and Redis failures keep the SQS message available for retry. */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { JobName } from "@/queue/JobName.js";

const state = {
	createWorkerContextCalls: [] as Record<string, unknown>[],
	getFullSubjectCalls: [] as Record<string, unknown>[],
	updateRemainingCalls: [] as Record<string, unknown>[],
	deleteCachedFullCustomerCalls: [] as Record<string, unknown>[],
};

mock.module("@/queue/createWorkerContext.js", () => ({
	createWorkerContext: async (args: Record<string, unknown>) => {
		state.createWorkerContextCalls.push(args);
		return {
			id: "req_123",
			org: { id: "org_123", slug: "test-org" },
			env: AppEnv.Sandbox,
			customerId: "cus_123",
			logger: {
				error: mock(() => {}),
				info: mock(() => {}),
			},
			extraLogs: {},
		};
	},
}));

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

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: async (args: Record<string, unknown>) => {
			state.deleteCachedFullCustomerCalls.push(args);
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

const { processMessage, shouldRetrySqsJobError } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/queue/processMessage.js?updateBalance"
);

describe("processMessage update-balance jobs", () => {
	beforeEach(() => {
		state.createWorkerContextCalls = [];
		state.getFullSubjectCalls = [];
		state.updateRemainingCalls = [];
		state.deleteCachedFullCustomerCalls = [];
	});

	test("creates a cache-capable worker context and executes the V2 update core", async () => {
		const params = {
			customer_id: "cus_123",
			feature_id: "messages",
			remaining: 40,
		};
		const payload = {
			orgId: "org_123",
			env: AppEnv.Sandbox,
			customerId: "cus_123",
			requestId: "req_123",
			params,
			targetBalance: 40,
		};
		const message = {
			MessageId: "msg_123",
			Body: JSON.stringify({
				name: JobName.UpdateBalance,
				data: payload,
			}),
		} satisfies Pick<Message, "MessageId" | "Body">;

		await processMessage({ message: message as Message, db: {} as never });

		expect(state.createWorkerContextCalls).toHaveLength(1);
		expect(state.createWorkerContextCalls[0]).toMatchObject({
			payload,
			skipCache: false,
		});
		expect(state.getFullSubjectCalls).toHaveLength(1);
		expect(state.getFullSubjectCalls[0]).toMatchObject({
			customerId: "cus_123",
			source: "handleUpdateBalance",
		});
		expect(state.updateRemainingCalls).toHaveLength(1);
		expect(state.updateRemainingCalls[0]).toMatchObject({ params });
		expect(state.deleteCachedFullCustomerCalls).toEqual([]);
	});

	test("retries transient infrastructure failures", () => {
		const transientDbError = Object.assign(new Error("connect timeout"), {
			code: "CONNECT_TIMEOUT",
		});
		const transientRedisError = new RedisUnavailableError({
			source: "updateBalanceV2",
			reason: "timeout",
		});

		expect(
			shouldRetrySqsJobError({
				jobName: JobName.UpdateBalance,
				error: transientDbError,
			}),
		).toBe(true);
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.UpdateBalance,
				error: transientRedisError,
			}),
		).toBe(true);
	});
});
