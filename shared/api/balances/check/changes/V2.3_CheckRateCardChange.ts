import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceRateCardToV2_3 } from "../../../customers/cusFeatures/changes/V2.3_BalanceRateCardChange.js";
import { transformFeatureRateCardToV2_3 } from "../../../features/changes/V2.3_FeatureRateCardChange.js";
import { CheckResponseV3Schema } from "../checkResponseV3.js";

export const V2_3_CheckRateCardChange = defineVersionChange({
	name: "V2_3 Check Rate Card Change",
	newVersion: ApiVersion.V2_4,
	oldVersion: ApiVersion.V2_3,
	description:
		"Expanded balance and flag features use the V2.3 rate-card shape",
	affectedResources: [AffectedResource.Check],
	newSchema: CheckResponseV3Schema,
	oldSchema: CheckResponseV3Schema,
	affectsResponse: true,
	affectsRequest: false,
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof CheckResponseV3Schema>;
	}): z.infer<typeof CheckResponseV3Schema> => ({
		...input,
		balance: input.balance
			? transformBalanceRateCardToV2_3({ input: input.balance })
			: null,
		balances: input.balances
			? Object.fromEntries(
					Object.entries(input.balances).map(([featureId, balance]) => [
						featureId,
						balance ? transformBalanceRateCardToV2_3({ input: balance }) : null,
					]),
				)
			: undefined,
		flag: input.flag?.feature
			? {
					...input.flag,
					feature: transformFeatureRateCardToV2_3({
						input: input.flag.feature,
					}),
				}
			: input.flag,
	}),
});
