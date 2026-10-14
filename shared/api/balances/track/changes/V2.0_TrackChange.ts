import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { ApiBalance } from "../../../customers/cusFeatures/apiBalance.js";
import { balanceV1ToV0 } from "../../../customers/cusFeatures/mappers/balanceV1ToV0.js";
import { TrackResponseV2Schema } from "../trackResponseV2.js";
import { TrackResponseV3Schema } from "../trackResponseV3.js";

export const V2_0_TrackChange = defineVersionChange({
	name: "V2_0 Track Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance schema transform (V1 to V0)"],
	affectedResources: [AffectedResource.Track],
	newSchema: TrackResponseV3Schema,
	oldSchema: TrackResponseV2Schema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof TrackResponseV3Schema>;
	}): z.infer<typeof TrackResponseV2Schema> => {
		const transformedBalance = input.balance
			? balanceV1ToV0({ input: input.balance })
			: null;

		let transformedBalances: Record<string, ApiBalance | null> | undefined;
		if (input.balances) {
			transformedBalances = {};
			for (const [featureId, balance] of Object.entries(input.balances)) {
				transformedBalances[featureId] = balance
					? balanceV1ToV0({ input: balance })
					: null;
			}
		}

		const {
			customer_id,
			entity_id,
			event_name,
			value,
		}: z.infer<typeof TrackResponseV3Schema> = input;

		return {
			customer_id,
			entity_id,
			event_name,
			value,
			balance: transformedBalance,
			balances: transformedBalances,
		};
	},
});
