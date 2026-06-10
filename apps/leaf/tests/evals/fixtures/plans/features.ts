import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import { FeatureType } from "@models/featureModels/featureEnums.js";

const feature = ({
	archived = false,
	consumable,
	eventNames,
	featureId,
	name,
	type,
}: {
	archived?: boolean;
	consumable: boolean;
	eventNames?: string[];
	featureId: string;
	name: string;
	type: ApiFeatureV1["type"];
}): ApiFeatureV1 => ({
	archived,
	consumable,
	event_names: eventNames,
	id: featureId,
	name,
	type,
});

const nameFromId = (featureId: string) =>
	featureId
		.split(/[-_]/)
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");

/** Feature fixtures for plan scenarios; pass feature objects into item fixtures. */
export const features = {
	allocated: ({
		featureId = "seats",
		name = featureId === "seats" ? "Seats" : nameFromId(featureId),
	}: {
		featureId?: string;
		name?: string;
	} = {}): ApiFeatureV1 =>
		feature({
			consumable: false,
			featureId,
			name,
			type: FeatureType.Metered,
		}),
	boolean: ({
		featureId = "admin_dashboard",
		name = featureId === "admin_dashboard"
			? "Admin Dashboard"
			: nameFromId(featureId),
	}: {
		featureId?: string;
		name?: string;
	} = {}): ApiFeatureV1 =>
		feature({
			consumable: false,
			featureId,
			name,
			type: FeatureType.Boolean,
		}),
	consumable: ({
		featureId = "api_calls",
		name = featureId === "api_calls" ? "API Calls" : nameFromId(featureId),
	}: {
		featureId?: string;
		name?: string;
	} = {}): ApiFeatureV1 =>
		feature({
			consumable: true,
			eventNames: [featureId],
			featureId,
			name,
			type: FeatureType.Metered,
		}),
	creditSystem: ({
		featureId = "credits",
		meteredFeatureId = "api_calls",
		name = featureId === "credits" ? "Credits" : nameFromId(featureId),
	}: {
		featureId?: string;
		meteredFeatureId?: string;
		name?: string;
	} = {}): ApiFeatureV1 => ({
		...feature({
			consumable: true,
			featureId,
			name,
			type: FeatureType.CreditSystem,
		}),
		credit_schema: [{ metered_feature_id: meteredFeatureId, credit_cost: 1 }],
	}),
} as const;
