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

type CascadeMarker = {
	systems?: Array<{ feature_id?: unknown; cost?: unknown }>;
};

export const getTokenCascadeDeductionsFromBody = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): FeatureDeduction[] | null => {
	const properties = body.properties ?? {};
	const cascade = properties.cascade as CascadeMarker | undefined;
	const rawSystems =
		cascade && Array.isArray(cascade.systems) ? cascade.systems : null;
	if (!rawSystems || rawSystems.length < 2) return null;

	const resolvedSystems: { feature: Feature; cost: number }[] = [];
	for (const entry of rawSystems) {
		const feature =
			typeof entry.feature_id === "string"
				? ctx.features.find((candidate) => candidate.id === entry.feature_id)
				: undefined;
		const cost = asNumber(entry.cost);
		if (
			!feature ||
			!isAiCreditSystem(feature.type) ||
			cost === null ||
			cost < 0
		) {
			return null;
		}
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
			statusCode: 404,
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
