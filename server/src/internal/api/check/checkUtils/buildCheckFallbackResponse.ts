import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckParams,
	type CheckResponseV3,
	CheckResponseV3Schema,
	type Feature,
	FeatureType,
	findFeatureById,
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

	const foundFeature = body.feature_id
		? findFeatureById({ features: ctx.features, featureId: body.feature_id })
		: undefined;

	// Unknown feature: stub it so old-version callers still get their own
	// response shape instead of a raw V3 body their SDKs can't parse.
	const featureToUse: Feature = foundFeature ?? {
		internal_id: "",
		org_id: ctx.org.id,
		created_at: Date.now(),
		env: ctx.env,
		id: body.feature_id ?? "",
		name: body.feature_id ?? "",
		type: FeatureType.Metered,
		config: null,
		archived: false,
		event_names: [],
	};

	return applyResponseVersionChanges<CheckResponseV3>({
		input: fallbackResponse,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		legacyData: {
			noCusEnts: false,
			featureToUse,
		},
		ctx,
	});
};
