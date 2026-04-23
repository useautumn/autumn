import type { ParsedCheckParams } from "@autumn/shared";
import { withRedisFallback } from "@/external/redis/utils/withRedisFallback.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { getCheckFailOpenFallback } from "@/internal/api/check/checkUtils/getCheckFailOpenFallback.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { runCheckLegacyFlow } from "./runCheckLegacyFlow.js";
import { runCheckV2 } from "./runCheckV2.js";
import type { RunCheckResult } from "./types.js";

export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData | CheckDataV2>> => {
	if (!isFullSubjectRolloutEnabled({ ctx })) {
		return runCheckLegacyFlow({ ctx, body, requiredBalance });
	}

	return await withRedisFallback<RunCheckResult<CheckData | CheckDataV2>>({
		primary: () => runCheckV2({ ctx, body, requiredBalance }),
		fallback: (error) => {
			ctx.logger.warn(
				{ source: error.source, reason: error.reason },
				"[check] Redis unavailable, returning fail-open response",
			);
			return {
				checkData: null,
				response: getCheckFailOpenFallback({
					ctx,
					body,
					requiredBalance,
					error,
				}) as Record<string, unknown>,
			};
		},
	});
};
