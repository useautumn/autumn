import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
	postgresCalls: [] as Record<string, unknown>[],
};

mock.module("@/internal/balances/track/utils/queueTrack.js", () => ({
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
		return {
			customer_id: "cus_123",
			feature_id: "messages",
			balance: null,
		};
	},
}));

mock.module(
	"@/internal/balances/track/v3/runPostgresTrackV3.js",
	() => ({
		runPostgresTrackV3: async (args: Record<string, unknown>) => {
			mockState.postgresCalls.push(args);
			return { customer_id: "cus_123", balance: 1 };
		},
	}),
);

import { handleRedisTrackErrorV3 } from "@/internal/balances/track/v3/handleRedisTrackErrorV3.js";

const ctx = {
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	logger: {
		warn: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("handleRedisTrackErrorV3", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
		mockState.postgresCalls = [];
	});

	test("queues track instead of falling back to Postgres when Redis is unavailable", async () => {
		const response = await handleRedisTrackErrorV3({
			ctx,
			error: new RedisDeductionError({
				message: "Redis not ready for deduction",
				code: RedisDeductionErrorCode.RedisUnavailable,
			}),
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
			},
			fullSubject: {} as never,
			featureDeductions: [],
		});

		expect(mockState.queueCalls).toHaveLength(1);
		expect(mockState.postgresCalls).toHaveLength(0);
		expect(response).toMatchObject({
			customer_id: "cus_123",
			balance: null,
		});
	});
});
