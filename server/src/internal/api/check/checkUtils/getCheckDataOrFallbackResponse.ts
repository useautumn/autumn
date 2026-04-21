import type { CheckParams, ParsedCheckParams } from "@autumn/shared";
import { isRetryableDbError } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "../checkTypes/CheckData.js";
import { buildCheckFallbackResponse } from "./buildCheckFallbackResponse.js";
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

		ctx.logger.warn("[check] Returning fail-open fallback response", {
			type: "check_fail_open_fallback",
			error,
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: body.feature_id,
			required_balance: requiredBalance,
		});

		return {
			checkData: null,
			fallbackResponse: buildCheckFallbackResponse({
				ctx,
				body,
				requiredBalance,
			}) as Record<string, unknown>,
		};
	}
};
