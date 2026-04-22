import type { CheckParams, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCheckFallbackResponse } from "./buildCheckFallbackResponse.js";

export const getCheckFailOpenFallback = ({
	ctx,
	body,
	requiredBalance,
	error,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
	error: unknown;
}) => {
	ctx.logger.warn("[check] Returning fail-open fallback response", {
		type: "check_fail_open_fallback",
		error,
		feature_id: body.feature_id,
		required_balance: requiredBalance,
	});

	return buildCheckFallbackResponse({
		ctx,
		body,
		requiredBalance,
	});
};
