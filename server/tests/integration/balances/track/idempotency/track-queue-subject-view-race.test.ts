import { afterAll, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import type { Redis } from "ioredis";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import { RedisDeductionErrorCode } from "@/internal/balances/utils/types/redisDeductionError.js";
import { incrementFullSubjectViewEpoch } from "@/internal/customers/cache/fullSubject/actions/invalidate/incrementFullSubjectViewEpoch.js";
import { JobName } from "@/queue/JobName.js";
import { processMessage } from "@/queue/processMessage.js";
import { buildCustomerMeteredScenario } from "../../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../../../db/full-subject/utils/withInsertedScenario.js";

const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";

const originalApiVersion = ctx.apiVersion;
ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_1);
afterAll(() => {
	ctx.apiVersion = originalApiVersion;
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

type DeductFromSubjectBalances = (...args: unknown[]) => Promise<string>;

const withCacheRebuildBeforeEveryDeduction = async ({
	customerId,
	run,
}: {
	customerId: string;
	run: () => Promise<void>;
}) => {
	const redis = resolveRedisV2({ customerId }) as Redis & {
		deductFromSubjectBalances: DeductFromSubjectBalances;
	};
	const deduct = redis.deductFromSubjectBalances;
	redis.deductFromSubjectBalances = async (...args: unknown[]) => {
		if (String(args.at(-1)).includes(`"customer_id":"${customerId}"`)) {
			await incrementFullSubjectViewEpoch({ ctx, customerId });
		}
		return deduct.apply(redis, args);
	};

	try {
		await run();
	} finally {
		redis.deductFromSubjectBalances = deduct;
	}
};

test("queued track redelivers after SUBJECT_VIEW_CHANGED and deducts exactly once", async () => {
	const scenario = buildCustomerMeteredScenario({
		ctx,
		name: "track-queue-subject-view-race",
	});
	const customerId = scenario.ids.customerId;
	const body = {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	};
	const message = {
		MessageId: `msg-${ctx.id}-subject-view-race`,
		Body: JSON.stringify({
			name: JobName.Track,
			data: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				requestId: `${ctx.id}-subject-view-race`,
				apiVersion: ApiVersion.V2_1,
				body,
				validateTrackBodyIdempotencyKey: false,
			},
		}),
	} as Message;
	const deliver = () =>
		processMessage({
			message,
			db: ctx.db,
			retryBudget: { kind: "unknown" },
		});

	await withInsertedScenario({
		ctx,
		scenario,
		run: async () => {
			await withCacheRebuildBeforeEveryDeduction({
				customerId,
				run: async () => {
					await expect(deliver()).rejects.toMatchObject({
						code: RedisDeductionErrorCode.SubjectViewChanged,
					});
				},
			});

			await deliver();
			await deliver();

			const verifyCtx = {
				...ctx,
				id: `${ctx.id}-subject-view-race-verify`,
			} as typeof ctx;
			const verifyBody = { ...body, value: 1 };
			const response = await runTrackV3({
				ctx: verifyCtx,
				body: verifyBody,
				featureDeductions: getTrackFeatureDeductionsForBody({
					ctx: verifyCtx,
					body: verifyBody,
				}),
				apiVersion: ApiVersion.V2_1,
			});
			expect(response.balance).toMatchObject({
				feature_id: TestFeature.Messages,
				remaining: 76,
			});
		},
	});
});
