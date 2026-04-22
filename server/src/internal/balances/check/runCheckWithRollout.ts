import type { ParsedCheckParams } from "@autumn/shared";
import { Result } from "better-result";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { getCheckFailOpenFallback } from "@/internal/api/check/checkUtils/getCheckFailOpenFallback.js";
import {
	isFullSubjectRolloutEnabled,
	isRetryableFullSubjectRolloutError,
} from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { runCheckLegacyFlow } from "./runCheckLegacyFlow.js";
import { runCheckV2 } from "./runCheckV2.js";
import type { RunCheckResult } from "./types.js";

const isFailOpenOnRedisDegradedEnabled = () =>
	process.env.CHECK_FAIL_OPEN_ON_REDIS_DEGRADED !== "false";

export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData | CheckDataV2>> => {
	// if (isFailOpenOnRedisDegradedEnabled() && !shouldUseRedis()) {
	// 	ctx.logger.warn(
	// 		{
	// 			customerId: body.customer_id,
	// 			entityId: body.entity_id,
	// 			orgId: ctx.org.id,
	// 			env: ctx.env,
	// 			feature_id: body.feature_id,
	// 		},
	// 		"[check] Redis degraded, failing open",
	// 	);
	// 	return {
	// 		checkData: null,
	// 		response: getCheckFailOpenFallback({
	// 			ctx,
	// 			body,
	// 			requiredBalance,
	// 			error: new Error("redis_degraded"),
	// 		}) as Record<string, unknown>,
	// 	};
	// }

	if (isFullSubjectRolloutEnabled({ ctx })) {
		const result = await Result.tryPromise({
			try: () =>
				runCheckV2({
					ctx,
					body,
					requiredBalance,
				}),
			catch: (error: unknown) => error,
		});

		if (Result.isOk(result)) return result.value;

		const error = result.error;
		if (!isRetryableFullSubjectRolloutError({ error })) {
			throw error;
		}

		return {
			checkData: null,
			response: getCheckFailOpenFallback({
				ctx,
				body,
				requiredBalance,
				error,
			}) as Record<string, unknown>,
		};
	}

	return runCheckLegacyFlow({
		ctx,
		body,
		requiredBalance,
	});
};
