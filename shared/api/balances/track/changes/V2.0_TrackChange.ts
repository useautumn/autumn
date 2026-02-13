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

/**
 * V2_0_TrackChange: Transforms track response from V3 (V2.1) to V2 (V2.0) format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Changes:
 * - Transforms balance from ApiBalanceV1 to ApiBalance (V0 format)
 * - Transforms balances record from ApiBalanceV1 to ApiBalance (V0 format)
 */
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
		// Transform single balance
		const transformedBalance = input.balance
			? balanceV1ToV0({ input: input.balance })
			: null;

		// Transform balances record
		let transformedBalances: Record<string, ApiBalance> | undefined;
		if (input.balances) {
			transformedBalances = {};
			for (const [featureId, balance] of Object.entries(input.balances)) {
				transformedBalances[featureId] = balanceV1ToV0({ input: balance });
			}
		}

		return {
			...input,
			balance: transformedBalance,
			balances: transformedBalances,
		};
	},
});
