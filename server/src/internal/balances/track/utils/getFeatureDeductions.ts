import {
	type Feature,
	FeatureNotFoundError,
	isAiCreditSystem,
	type LockParams,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	buildTokenCascadeDeduction,
	type FeatureDeduction,
} from "../../utils/types/featureDeduction.js";

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
 * each system's request-time pricing instead of replaying the whole value
 * against the primary feature. The deduction is atomic and idempotency-keyed,
 * so a full replay is naturally safe — no partial-state bookkeeping needed.
 * Returns null when the body carries no valid cascade (fewer than two resolved,
 * distinct systems); callers then fall back to the standard deductions. Only
 * for internally queued bodies — properties on direct /track calls are
 * caller-controlled and must not be honored as a cascade.
 */
export const getTokenCascadeDeductionsFromBody = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): FeatureDeduction[] | null => {
	const properties = body.properties ?? {};
	const cascade = properties.cascade as { systems?: unknown } | undefined;
	const rawSystems =
		cascade && Array.isArray(cascade.systems) ? cascade.systems : null;
	// A cascade needs at least two systems; a single-system track carries no
	// marker and replays through the standard path.
	if (!rawSystems || rawSystems.length < 2) return null;

	const resolvedSystems: { feature: Feature; cost: number }[] = [];
	for (const rawSystem of rawSystems) {
		const entry = rawSystem as { feature_id?: unknown; cost?: unknown };
		const feature = resolveAiCreditFeatureForCascade({
			ctx,
			featureId: entry.feature_id,
		});
		const cost = asNumber(entry.cost);
		if (!feature || cost === null || cost < 0) return null;
		resolvedSystems.push({ feature, cost });
	}

	const featureIds = resolvedSystems.map((system) => system.feature.id);
	if (new Set(featureIds).size !== featureIds.length) return null;

	const tokenUsage = {
		modelName: typeof properties.model === "string" ? properties.model : "",
		inputTokens: asNumber(properties.input_tokens) ?? 0,
		outputTokens: asNumber(properties.output_tokens) ?? 0,
	};

	return [buildTokenCascadeDeduction({ systems: resolvedSystems, tokenUsage })];
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
