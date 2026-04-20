import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckParams,
	type CheckResponseV3,
	CheckResponseV3Schema,
	type ParsedCheckParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const buildCheckFallbackResponse = ({
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
		? applyResponseVersionChanges<CheckResponseV3>({
				input: fallbackResponse,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Check,
				legacyData: {
					noCusEnts: false,
					featureToUse,
				},
				ctx,
			})
		: fallbackResponse;
};
