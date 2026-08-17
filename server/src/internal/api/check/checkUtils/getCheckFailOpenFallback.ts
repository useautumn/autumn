import type { CheckParams, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCheckFallbackResponse } from "./buildCheckFallbackResponse.js";

export type CheckFailOpenReason =
	| "route_timeout"
	| "org_rate_limit"
	| "dependency_error";

export const getCheckFailOpenFallback = ({
	ctx,
	body,
	requiredBalance,
	error,
	reason,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
	error: unknown;
	reason: CheckFailOpenReason;
}) => {
	ctx.logger.warn("[check] Returning fail-open fallback response", {
		type: "check_fail_open_fallback",
		fail_open_reason: reason,
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
