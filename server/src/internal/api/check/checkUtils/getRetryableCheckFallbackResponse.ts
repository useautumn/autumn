import {
	type CheckParams,
	CheckResponseV3Schema,
	type ParsedCheckParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { transformCheckResponse } from "./transformCheckResponse.js";

export const getRetryableCheckFallbackResponse = ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
}) => {
	const fallbackResponse = CheckResponseV3Schema.parse({
		allowed: true,
		customer_id: body.customer_id || "",
		entity_id: body.entity_id,
		required_balance: requiredBalance,
		balance: null,
		flag: null,
	});

	const featureToUse = ctx.features.find(
		(feature) => feature.id === body.feature_id,
	);

	return featureToUse
		? transformCheckResponse({
				ctx,
				response: fallbackResponse,
				featureToUse,
				noCusEnts: false,
			})
		: fallbackResponse;
};
