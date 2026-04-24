import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const mockState = {
	postgresCalls: [] as Record<string, unknown>[],
};

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
		mockState.postgresCalls = [];
	});

	test("normalizes Redis unavailable to RedisUnavailableError", async () => {
		const error = new RedisDeductionError({
			message: "Redis not ready for deduction",
			code: RedisDeductionErrorCode.RedisUnavailable,
		});

		await expect(
			handleRedisTrackErrorV3({
				ctx,
				error,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					value: 1,
				},
				fullSubject: {} as never,
				featureDeductions: [],
			}),
		).rejects.toMatchObject({
			name: "RedisUnavailableError",
			source: "runTrackV3",
			reason: "other",
		} satisfies Partial<RedisUnavailableError>);

		expect(mockState.postgresCalls).toHaveLength(0);
	});
});
