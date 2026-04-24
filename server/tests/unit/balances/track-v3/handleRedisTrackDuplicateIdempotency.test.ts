import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	type RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRedisTrackErrorV3 } from "@/internal/balances/track/v3/handleRedisTrackErrorV3.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const ctx = {
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	logger: {
		warn: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("handleRedisTrackErrorV3 duplicate idempotency", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("maps duplicate idempotency to the public duplicate error", async () => {
		await expect(
			handleRedisTrackErrorV3({
				ctx,
				error: new RedisDeductionError({
					message: "duplicate idempotency",
					code: RedisDeductionErrorCode.DuplicateIdempotencyKey,
				}),
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					idempotency_key: "idem_123",
					value: 1,
				},
				fullSubject: {} as never,
				featureDeductions: [],
			}),
		).rejects.toMatchObject({
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		} satisfies Partial<RecaseError>);
	});
});
