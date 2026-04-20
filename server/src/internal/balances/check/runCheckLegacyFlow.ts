import type {
	CheckParams,
	CheckResponseV3,
	ParsedCheckParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { getCheckData } from "@/internal/api/check/checkUtils/getCheckData.js";
import { getV2CheckResponse } from "@/internal/api/check/checkUtils/getV2CheckResponse.js";
import { runCheckWithTrack } from "@/internal/api/check/runCheckWithTrack.js";

export const runCheckLegacyFlow = async ({
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
	const checkData = await getCheckData({
		ctx,
		body: body as CheckParams & { feature_id: string },
		requiredBalance,
	});

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
