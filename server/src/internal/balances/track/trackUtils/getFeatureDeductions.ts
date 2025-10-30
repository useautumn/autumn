import { type Feature, FeatureNotFoundError } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	getCreditCost,
	getCreditSystemsFromFeature,
} from "../../../features/creditSystemUtils.js";

export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
};

const DEFAULT_VALUE = 1;

export const getTrackFeatureDeductions = ({
	ctx,
	featureId,
	value,
}: {
	ctx: AutumnContext;
	featureId: string;
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
	const creditSystems = getCreditSystemsFromFeature({
		featureId: mainFeature.id,
		features,
	});

	featureDeductions.push({
		feature: mainFeature,
		deduction: mainFeatureDeduction,
	});

	for (const creditSystem of creditSystems) {
		const creditSystemDeduction = getCreditCost({
			featureId: mainFeature.id,
			creditSystem,
			amount: mainFeatureDeduction,
		});

		featureDeductions.push({
			feature: creditSystem,
			deduction: creditSystemDeduction,
		});
	}

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

	return featureDeductions;
};
