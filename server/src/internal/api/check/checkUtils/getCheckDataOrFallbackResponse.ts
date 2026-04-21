import type { CheckParams, ParsedCheckParams } from "@autumn/shared";
import { isRetryableDbError } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "../checkTypes/CheckData.js";
import { getCheckFailOpenFallback } from "./getCheckFailOpenFallback.js";
import { getCheckData } from "./getCheckData.js";

type CheckBody = (CheckParams & { feature_id: string });

type GetCheckDataResult =
	| {
			checkData: CheckData;
			fallbackResponse: null;
	  }
	| {
			checkData: null;
			fallbackResponse: Record<string, unknown>;
	  };

export const getCheckDataOrFallbackResponse = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | CheckBody;
	requiredBalance: number;
}): Promise<GetCheckDataResult> => {
	try {
		return {
			checkData: await getCheckData({
				ctx,
				body: body as CheckBody,
				requiredBalance,
			}),
			fallbackResponse: null,
		};
	} catch (error) {
		if (!isRetryableDbError({ error })) {
			throw error;
		}

		return {
			checkData: null,
			fallbackResponse: getCheckFailOpenFallback({
				ctx,
				body,
				requiredBalance,
				error,
			}) as Record<string, unknown>,
		};
	}
};
