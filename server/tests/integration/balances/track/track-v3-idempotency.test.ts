import { expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { Decimal } from "decimal.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { getTrackIdempotencyKey } from "@/internal/balances/track/utils/handleEventIdempotencyKey.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import { getRedisIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";
import { buildCustomerMeteredScenario } from "../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../../db/full-subject/utils/withInsertedScenario.js";

test("track-v3 idempotency is atomic for single-feature requests", async () => {
	const scenario = buildCustomerMeteredScenario({
		ctx,
		name: "track-v3-idempotency",
	});
	const originalApiVersion = ctx.apiVersion;
	const idempotencyKey = `track-v3-idem-${Date.now().toString(36)}`;
	const body = {
		customer_id: scenario.ids.customerId,
		feature_id: TestFeature.Messages,
		value: 25.5,
		idempotency_key: idempotencyKey,
	};

	await withInsertedScenario({
		ctx,
		scenario,
		run: async () => {
			ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_1);

			try {
				const featureDeductions = getTrackFeatureDeductionsForBody({
					ctx,
					body,
				});

				const response = await runTrackV3({
					ctx,
					body,
					featureDeductions,
					apiVersion: ApiVersion.V2_1,
				});
				expect(response.balance).toMatchObject({
					feature_id: TestFeature.Messages,
					remaining: new Decimal(87).sub(body.value).toNumber(),
				});

				await expect(
					runTrackV3({
						ctx,
						body,
						featureDeductions,
						apiVersion: ApiVersion.V2_1,
					}),
				).rejects.toMatchObject({
					code: ErrCode.DuplicateIdempotencyKey,
					statusCode: 409,
				});
			} finally {
				ctx.apiVersion = originalApiVersion;
			}

			const { redisKey } = getRedisIdempotencyKey({
				orgId: ctx.org.id,
				env: ctx.env,
				idempotencyKey: getTrackIdempotencyKey({
					idempotencyKey,
					requestId: ctx.id,
				}),
				slotKey: body.customer_id,
			});
			expect(await ctx.redisV2.exists(redisKey)).toBe(1);
		},
	});
});
