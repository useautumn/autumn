import {
	FeatureNotFoundError,
	isAiCreditSystem,
	type LockParams,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

const DEFAULT_VALUE = 1;

const asNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const resolveAiCreditFeatureForCascade = ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: unknown;
}) => {
	if (typeof featureId !== "string") return null;
	const feature = ctx.features.find((candidate) => candidate.id === featureId);
	return feature && isAiCreditSystem(feature.type) ? feature : null;
};

/**
 * Rebuilds the cascade deduction of a token track from the `properties.cascade`
 * marker that getTokenTrackParams stamps on the body, so queued replays keep
 * included-then-overage semantics instead of replaying the whole value against
 * the primary feature. The deduction is atomic and idempotency-keyed, so a full
 * replay is naturally safe — no partial-state bookkeeping needed. Returns null
 * when the body carries no valid marker; callers then fall back to the standard
 * deductions. Only for internally queued bodies — properties on direct /track
 * calls are caller-controlled and must not be honored as a cascade.
 */
export const getTokenCascadeDeductionsFromBody = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): FeatureDeduction[] | null => {
	const properties = body.properties ?? {};
	const cascade = properties.cascade as
		| {
				included_feature_id?: unknown;
				overage_feature_id?: unknown;
				included?: { cost?: unknown };
				overage?: { cost?: unknown };
		  }
		| undefined;
	if (!cascade) return null;

	const includedFeature = resolveAiCreditFeatureForCascade({
		ctx,
		featureId: cascade.included_feature_id,
	});
	const overageFeature = resolveAiCreditFeatureForCascade({
		ctx,
		featureId: cascade.overage_feature_id,
	});
	const includedCost = asNumber(cascade.included?.cost);
	const overageCost = asNumber(cascade.overage?.cost);
	if (
		!includedFeature ||
		!overageFeature ||
		includedFeature.id === overageFeature.id ||
		includedCost === null ||
		overageCost === null ||
		includedCost < 0 ||
		overageCost < 0
	) {
		return null;
	}

	const tokenUsage = {
		modelName: typeof properties.model === "string" ? properties.model : "",
		inputTokens: asNumber(properties.input_tokens) ?? 0,
		outputTokens: asNumber(properties.output_tokens) ?? 0,
	};

	return [
		{
			feature: includedFeature,
			deduction: 1,
			tokens: { usage: tokenUsage, cost: includedCost },
			spillover: [
				{
					feature: overageFeature,
					tokens: { usage: tokenUsage, cost: overageCost },
				},
			],
		},
	];
};

export const getTrackFeatureDeductions = ({
	ctx,
	featureId,
	lock,
	value,
}: {
	ctx: AutumnContext;
	featureId: string;
	lock?: LockParams;
	value?: number;
}) => {
	const featureDeductions: FeatureDeduction[] = [];

	const mainFeatureDeduction = value ?? DEFAULT_VALUE;

	// 1. If feature ID
	const features = ctx.features;
	const mainFeature = features.find((f) => f.id === featureId);
	if (!mainFeature) {
		throw new FeatureNotFoundError({
			featureId,
		});
	}

	featureDeductions.push({
		feature: mainFeature,
		deduction: mainFeatureDeduction,
		lock,
	});

	return featureDeductions;
};

export const getTrackEventNameDeductions = ({
	ctx,
	eventName,
	value,
}: {
	ctx: AutumnContext;
	eventName: string;
	value?: number;
}) => {
	const features = ctx.features;

	const mainFeatures = features.filter((f) =>
		f.event_names?.includes(eventName),
	);

	const featureDeductions = mainFeatures.flatMap((f) =>
		getTrackFeatureDeductions({
			ctx,
			featureId: f.id,
			value,
		}),
	);

	if (featureDeductions.length === 0) {
		throw new RecaseError({
			message: `No features found for event name: ${eventName}`,
		});
	}

	return featureDeductions;
};

export const getTrackFeatureDeductionsForBody = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}) =>
	body.feature_id
		? getTrackFeatureDeductions({
				ctx,
				featureId: body.feature_id,
				lock: body.lock,
				value: body.value,
			})
		: getTrackEventNameDeductions({
				ctx,
				eventName: body.event_name!,
				value: body.value,
			});
