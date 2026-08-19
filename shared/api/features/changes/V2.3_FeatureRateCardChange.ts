import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../apiFeatureV1.js";
import { ApiFeatureV2_3Schema } from "../prevVersions/apiFeatureV2_3.js";

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
	transformResponse: ({ input }) => {
		const { invoice_credit: _invoiceCredit, credit_schema, ...feature } = input;
		let legacyCreditSchema:
			| z.infer<typeof ApiFeatureV2_3Schema>["credit_schema"]
			| undefined;

		if (credit_schema) {
			legacyCreditSchema = [];
			for (const item of credit_schema) {
				if (
					item.tier_behavior === "graduated" ||
					(item.billing_units !== undefined && item.billing_units !== 1)
				) {
					legacyCreditSchema = undefined;
					break;
				}
				legacyCreditSchema.push({
					metered_feature_id: item.metered_feature_id,
					credit_cost: item.credit_cost,
				});
			}
		}

		return {
			...feature,
			...(legacyCreditSchema === undefined
				? {}
				: { credit_schema: legacyCreditSchema }),
		} satisfies z.infer<typeof ApiFeatureV2_3Schema>;
	},
});
