import type { CheckResponseV3, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCheckFallbackResponse } from "@/internal/api/check/checkUtils/buildCheckFallbackResponse.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import {
	isFullSubjectRolloutEnabled,
	isRetryableFullSubjectRolloutError,
} from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { runCheckLegacyFlow } from "./runCheckLegacyFlow.js";
import { runCheckV2 } from "./runCheckV2.js";

export type RunCheckWithRolloutResult =
	| {
			checkData: CheckData | CheckDataV2;
			response: CheckResponseV3;
	  }
	| {
			checkData: null;
			response: Record<string, unknown>;
	  };
export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckWithRolloutResult> => {
	if (isFullSubjectRolloutEnabled({ ctx })) {
		try {
			return await runCheckV2({
				ctx,
				body,
				requiredBalance,
			});
		} catch (error) {
			if (!isRetryableFullSubjectRolloutError({ error })) {
				throw error;
			}

			ctx.logger.warn("[check] Returning fail-open fallback response", {
				type: "check_fail_open_fallback",
				error,
				feature_id: body.feature_id,
				required_balance: requiredBalance,
			});

			return {
				checkData: null,
				response: buildCheckFallbackResponse({
					ctx,
					body,
					requiredBalance,
				}) as Record<string, unknown>,
			};
		}
	}

	return runCheckLegacyFlow({
		ctx,
		body,
		requiredBalance,
	});
};
