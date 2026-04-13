import type { CheckResponseV3, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { getCheckDataV2 } from "./getCheckDataV2.js";
import { getCheckResponseV2 } from "./getCheckResponseV2.js";

export const runCheckV2 = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<{
	checkData: CheckDataV2;
	response: CheckResponseV3;
}> => {
	const checkData = await getCheckDataV2({
		ctx,
		body: body as ParsedCheckParams & { feature_id: string },
		requiredBalance,
	});

	const response = await getCheckResponseV2({
		checkData,
		requiredBalance,
	});

	return {
		checkData,
		response,
	};
};
