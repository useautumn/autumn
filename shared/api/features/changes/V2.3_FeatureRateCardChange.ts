import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../apiFeatureV1.js";
import { ApiFeatureV2_3Schema } from "../prevVersions/apiFeatureV2_3.js";

export const apiCreditSchemaToV2_3 = ({
	creditSchema,
}: {
	creditSchema: z.infer<typeof ApiFeatureV1Schema>["credit_schema"];
}): z.infer<typeof ApiFeatureV2_3Schema>["credit_schema"] => {
	if (creditSchema === undefined) return undefined;

	const legacyCreditSchema: NonNullable<
		z.infer<typeof ApiFeatureV2_3Schema>["credit_schema"]
	> = [];
	for (const item of creditSchema) {
		if (
			item.tier_behavior === "graduated" ||
			(item.billing_units !== undefined && item.billing_units !== 1)
		) {
			return undefined;
		}
		legacyCreditSchema.push({
			metered_feature_id: item.metered_feature_id,
			credit_cost: item.credit_cost,
		});
	}

	return legacyCreditSchema;
};

export const transformFeatureRateCardToV2_3 = ({
	input,
}: {
	input: z.infer<typeof ApiFeatureV1Schema>;
}): z.infer<typeof ApiFeatureV2_3Schema> => {
	const { invoice_credit: _invoiceCredit, credit_schema, ...feature } = input;
	const legacyCreditSchema = apiCreditSchemaToV2_3({
		creditSchema: credit_schema,
	});

	return {
		...feature,
		...(legacyCreditSchema === undefined
			? {}
			: { credit_schema: legacyCreditSchema }),
	};
};

export const V2_3_FeatureRateCardChange = defineVersionChange({
	name: "V2_3 Feature Rate Card Change",
	newVersion: ApiVersion.V2_4,
	oldVersion: ApiVersion.V2_3,
	description: [
		"Added invoice_credit to classic credit systems",
		"Added billing_units and graduated credit tiers",
	],
	affectedResources: [AffectedResource.Feature],
	newSchema: ApiFeatureV1Schema,
	oldSchema: ApiFeatureV2_3Schema,
	affectsResponse: true,
	affectsRequest: false,
	transformResponse: ({ input }) => transformFeatureRateCardToV2_3({ input }),
});
