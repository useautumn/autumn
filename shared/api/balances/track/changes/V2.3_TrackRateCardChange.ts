import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceRateCardToV2_3 } from "../../../customers/cusFeatures/changes/V2.3_BalanceRateCardChange.js";
import { TrackResponseV3Schema } from "../trackResponseV3.js";

export const V2_3_TrackRateCardChange = defineVersionChange({
	name: "V2_3 Track Rate Card Change",
	newVersion: ApiVersion.V2_4,
	oldVersion: ApiVersion.V2_3,
	description: "Expanded balance features use the V2.3 rate-card shape",
	affectedResources: [AffectedResource.Track],
	newSchema: TrackResponseV3Schema,
	oldSchema: TrackResponseV3Schema,
	affectsResponse: true,
	affectsRequest: false,
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof TrackResponseV3Schema>;
	}): z.infer<typeof TrackResponseV3Schema> => ({
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
	}),
});
