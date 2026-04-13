import type { CheckResponseV3, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { runCheckLegacyFlow } from "./runCheckLegacyFlow.js";
import { runCheckV2 } from "./runCheckV2.js";

export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<{
	checkData: CheckData;
	response: CheckResponseV3;
}> => {
	if (
		isFullSubjectRolloutEnabled({ ctx }) &&
		!body.send_event &&
		!body.lock?.enabled
	) {
		return runCheckV2({
			ctx,
			body,
			requiredBalance,
		});
	}

	if (isFullSubjectRolloutEnabled({ ctx })) {
		return runCheckLegacyFlow({
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
