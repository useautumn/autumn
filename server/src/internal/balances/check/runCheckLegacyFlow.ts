import type { CheckParams, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { getCheckDataOrFallbackResponse } from "@/internal/api/check/checkUtils/getCheckDataOrFallbackResponse.js";
import { getV2CheckResponse } from "@/internal/api/check/checkUtils/getV2CheckResponse.js";
import { runCheckWithTrack } from "@/internal/api/check/runCheckWithTrack.js";
import type { RunCheckResult } from "./types.js";

export const runCheckLegacyFlow = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData>> => {
	const { checkData, fallbackResponse } = await getCheckDataOrFallbackResponse({
		ctx,
		body: body as CheckParams & { feature_id: string },
		requiredBalance,
	});
	if (!checkData) {
		return {
			checkData: null,
			response: fallbackResponse,
		};
	}

	const response =
		body.send_event || body.lock?.enabled
			? await runCheckWithTrack({
					ctx,
					body,
					requiredBalance,
					checkData,
				})
			: await getV2CheckResponse({
					checkData,
					requiredBalance,
				});

	return {
		checkData,
		response,
	};
};
