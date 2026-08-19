import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformFeatureRateCardToV2_3 } from "../../features/changes/V2.3_FeatureRateCardChange.js";
import { ApiCustomerV5Schema } from "../apiCustomerV5.js";
import { transformBalanceRateCardToV2_3 } from "../cusFeatures/changes/V2.3_BalanceRateCardChange.js";

export const V2_3_CustomerRateCardChange = defineVersionChange({
	name: "V2_3 Customer Rate Card Change",
	newVersion: ApiVersion.V2_4,
	oldVersion: ApiVersion.V2_3,
	description:
		"Expanded balance and flag features use the V2.3 rate-card shape",
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerV5Schema,
	affectsResponse: true,
	affectsRequest: false,
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiCustomerV5Schema>;
	}): z.infer<typeof ApiCustomerV5Schema> => ({
		...input,
		balances: Object.fromEntries(
			Object.entries(input.balances).map(([featureId, balance]) => [
				featureId,
				transformBalanceRateCardToV2_3({ input: balance }),
			]),
		),
		flags: Object.fromEntries(
			Object.entries(input.flags).map(([featureId, flag]) => [
				featureId,
				flag.feature
					? {
							...flag,
							feature: transformFeatureRateCardToV2_3({
								input: flag.feature,
							}),
						}
					: flag,
			]),
		),
	}),
});
