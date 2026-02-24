import {
	CreateFeatureV2ParamsSchema,
	DeleteFeatureV1ParamsSchema,
	GetFeatureParamsSchema,
	UpdateFeatureV2ParamsSchema,
} from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const listFeaturesJsDoc = createJSDocDescription({
	description: "Lists all features in the current environment.",
	whenToUse:
		"Use this to retrieve all features configured for your organization to display in dashboards or for feature management.",
	examples: [],
	methodName: "features.list",
	returns: "A list of all features with their configuration and metadata.",
});

export const getFeatureJsDoc = createJSDocDescription({
	description: "Retrieves a single feature by its ID.",
	whenToUse:
		"Use this when you need to fetch the details of a specific feature.",
	body: GetFeatureParamsSchema,
	examples: [
		example({
			description: "Get a feature by ID",
			values: {
				featureId: "api-calls",
			},
		}),
	],
	methodName: "features.get",
	returns: "The feature object with its full configuration.",
});

export const createFeatureJsDoc = createJSDocDescription({
	description: "Creates a new feature.",
	whenToUse:
		"Use this to programmatically create features for metering usage, managing access, or building credit systems.",
	body: CreateFeatureV2ParamsSchema,
	examples: [
		example({
			description: "Create a metered feature for API calls",
			values: {
				featureId: "api-calls",
				name: "API Calls",
				type: "metered",
				consumable: true,
			},
		}),
		example({
			description: "Create a boolean feature for a premium feature flag",
			values: {
				featureId: "advanced-analytics",
				name: "Advanced Analytics",
				type: "boolean",
			},
		}),
	],
	methodName: "features.create",
	returns: "The created feature object.",
});

export const updateFeatureJsDoc = createJSDocDescription({
	description: "Updates an existing feature.",
	whenToUse:
		"Use this to modify feature properties like name, display settings, or to archive a feature.",
	body: UpdateFeatureV2ParamsSchema,
	examples: [
		example({
			description: "Update a feature's display name",
			values: {
				featureId: "api-calls",
				name: "API Requests",
				display: {
					singular: "API request",
					plural: "API requests",
				},
			},
		}),
		example({
			description: "Archive a feature",
			values: {
				featureId: "deprecated-feature",
				archived: true,
			},
		}),
	],
	methodName: "features.update",
	returns: "The updated feature object.",
});

export const deleteFeatureJsDoc = createJSDocDescription({
	description: "Deletes a feature by its ID.",
	whenToUse:
		"Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.",
	body: DeleteFeatureV1ParamsSchema,
	examples: [
		example({
			description: "Delete an unused feature",
			values: {
				featureId: "old-feature",
			},
		}),
	],
	methodName: "features.delete",
	returns: "A success flag indicating the feature was deleted.",
});
