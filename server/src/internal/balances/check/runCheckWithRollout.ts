import type { CheckResponseV3, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
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
		return runCheckV2({
			ctx,
			body,
			requiredBalance,
		});
	}

	return runCheckLegacyFlow({
		ctx,
		body,
		requiredBalance,
	});
};
