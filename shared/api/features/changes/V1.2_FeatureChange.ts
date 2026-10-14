import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { FeatureType } from "@models/featureModels/featureEnums.js";
import { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";
import type { z } from "zod/v4";
import { hasCreditDimensionRules } from "../../../utils/featureUtils/classifyFeature/hasCreditDimensionRules.js";
import { ApiFeatureV1Schema } from "../apiFeatureV1.js";
import { isGraduatedCreditSchemaItem } from "../creditRateCard.js";
import {
	ApiFeatureType,
	ApiFeatureV0Schema,
} from "../prevVersions/apiFeatureV0.js";

export const apiCreditSchemaToV0 = ({
	creditSchema,
}: {
	creditSchema: z.infer<typeof ApiFeatureV1Schema>["credit_schema"];
}): z.infer<typeof ApiFeatureV0Schema>["credit_schema"] => {
	if (!creditSchema) return null;

	const legacyCreditSchema: NonNullable<
		z.infer<typeof ApiFeatureV0Schema>["credit_schema"]
	> = [];
	for (const item of creditSchema) {
		if (
			isGraduatedCreditSchemaItem(item) ||
			hasCreditDimensionRules(item) ||
			(item.billing_units ?? 1) !== 1
		) {
			return null;
		}
		legacyCreditSchema.push({
			metered_feature_id: item.metered_feature_id,
			credit_cost: item.credit_cost,
		});
	}

	return legacyCreditSchema;
};

export const V1_2_FeatureChange = defineVersionChange({
	name: "V1_2 Feature Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Feature type enum changed from FeatureType to ApiFeatureType",
		"Removed consumable and event_names fields",
	],
	affectedResources: [AffectedResource.Feature],
	newSchema: ApiFeatureV1Schema,
	oldSchema: ApiFeatureV0Schema,
	affectsResponse: true,
	affectsRequest: false,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiFeatureV1Schema>;
	}): z.infer<typeof ApiFeatureV0Schema> => {
		let v0Type: ApiFeatureType;

		if (input.type === FeatureType.Boolean) {
			v0Type = ApiFeatureType.Boolean;
		} else if (input.type === FeatureType.CreditSystem) {
			v0Type = ApiFeatureType.CreditSystem;
		} else if (isAiCreditSystem(input.type)) {
			v0Type = ApiFeatureType.AiCreditSystem;
		} else if (input.type === FeatureType.Metered) {
			v0Type = input.consumable
				? ApiFeatureType.SingleUsage
				: ApiFeatureType.ContinuousUse;
		} else {
			v0Type = ApiFeatureType.Boolean;
		}
		const legacyCreditSchema = apiCreditSchemaToV0({
			creditSchema: input.credit_schema,
		});

		return {
			id: input.id,
			name: input.name,
			type: v0Type,
			display: input.display
				? {
						singular: input.display.singular || "",
						plural: input.display.plural || "",
					}
				: null,
			credit_schema: legacyCreditSchema ?? null,
			archived: input.archived,
		} satisfies z.infer<typeof ApiFeatureV0Schema>;
	},
});
