import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBreakdownV1ToV0 } from "../components/apiBalanceBreakdown/changes/V2.0_BalanceBreakdownChange.js";
import { ApiBalanceV1Schema } from "../apiBalanceV1.js";
import { ApiBalanceV0Schema } from "../previousVersions/apiBalanceV0.js";
import { type CusFeatureLegacyData, CusFeatureLegacyDataSchema } from "../cusFeatureLegacyData.js";

/**
 * Transform balance from V2.1 format to V2.0 format
 * Exported so it can be reused in other transformations (e.g., CustomerChange, EntityChange)
 */
export function transformBalanceV1ToV0({
	input,
	legacyData,
}: {
	input: z.infer<typeof ApiBalanceV1Schema>;
	legacyData?: CusFeatureLegacyData;
}): z.infer<typeof ApiBalanceV0Schema> {
	const { granted, balance, breakdown, ...rest } = input;

	// Transform breakdowns from V2.1 to V2.0 format
	const transformedBreakdown = breakdown?.map((bd) => {
		// Find matching legacy data for this breakdown
		const bdLegacyData = legacyData?.breakdown_legacy_data?.find(
			(ld) => ld.id === bd.id,
		);

		return transformBreakdownV1ToV0({
			input: bd,
			legacyData: bdLegacyData
				? {
						overage_allowed: bdLegacyData.overage_allowed,
						max_purchase: bdLegacyData.max_purchase,
					}
				: undefined,
		});
	});

	return {
		...rest,
		// V2.0 field names
		granted_balance: granted,
		current_balance: balance,
		// Restore removed fields from legacyData
		purchased_balance: legacyData?.purchased_balance ?? 0,
		plan_id: legacyData?.plan_id ?? null,
		breakdown: transformedBreakdown,
	};
}

/**
 * V2_0_BalanceChange: Transforms balance response TO V2.0 format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Breaking changes introduced in V2.1:
 * - Renamed "granted_balance" to "granted"
 * - Renamed "current_balance" to "balance"
 * - Removed "purchased_balance" (available in legacyData)
 * - Removed "plan_id" (available in legacyData)
 *
 * Input: ApiBalanceV1 (V2.1+ format)
 * Output: ApiBalanceV0 (V2.0 format)
 *
 * NOTE: This change is NOT registered in the registry - it's called by parent
 * transforms (CustomerChange, EntityChange). Export the transformBalanceV1ToV0
 * function so parents can call it.
 */
export const V2_0_BalanceChange = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Renamed 'granted' back to 'granted_balance'",
		"Renamed 'balance' back to 'current_balance'",
		"Restored 'purchased_balance' from legacyData",
		"Restored 'plan_id' from legacyData",
	],
	affectedResources: [AffectedResource.CusBalance],
	newSchema: ApiBalanceV1Schema,
	oldSchema: ApiBalanceV0Schema,
	legacyDataSchema: CusFeatureLegacyDataSchema,
	transformResponse: ({ input, legacyData }) =>
		transformBalanceV1ToV0({ input, legacyData }),
});
