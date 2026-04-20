import {
	FeatureNotFoundError,
	type LockParams,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

const DEFAULT_VALUE = 1;

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
