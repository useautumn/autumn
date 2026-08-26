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

/**
 * A check answered without ever loading check data, so it carries the verdict
 * and nothing else: `balance` is null and there is no breakdown, reset window
 * or flag. Both callers are deliberate about that — the fail-open path has no
 * balance to report, and the metering worker's fold only projects a number.
 */
const buildCheckResponseWithoutBalance = ({
	ctx,
	body,
	requiredBalance,
	allowed,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
	allowed: boolean;
}) => {
	const response = CheckResponseV3Schema.parse({
		allowed,
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
		input: response,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		legacyData: {
			noCusEnts: false,
			featureToUse,
		},
		ctx,
	});
};

export const buildCheckFallbackResponse = ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
}) =>
	buildCheckResponseWithoutBalance({
		ctx,
		body,
		requiredBalance,
		allowed: true,
	});

/** The worker's fold answers with a bare number, so the verdict is decided
 *  here against the same required balance the Redis path would have used. */
export const buildWorkerCheckResponse = ({
	ctx,
	body,
	requiredBalance,
	workerBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | (CheckParams & { feature_id: string });
	requiredBalance: number;
	workerBalance: number;
}) =>
	buildCheckResponseWithoutBalance({
		ctx,
		body,
		requiredBalance,
		allowed: workerBalance >= requiredBalance,
	});
