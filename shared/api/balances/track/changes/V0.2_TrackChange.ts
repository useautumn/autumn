import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import {
	TrackResponseV0Schema,
	TrackResponseV1Schema,
} from "../prevVersions/trackResponseV1.js";
import {
	type TrackLegacyData,
	TrackLegacyDataSchema,
} from "../trackLegacyData.js";

/**
 * V0_2_CheckChange: Transforms check response TO V0_2 format
 *
 * Applied when: targetVersion <= V0_2
 *
 * Breaking changes introduced in V0.2 (that we reverse here):
 *
 * 1. Structure: Single check result object → balances array format
 *    - V0.2+: Single object with allowed, feature_id, balance, unlimited, etc.
 *    - V0_2: { allowed, balances: [{ feature_id, required, balance, unlimited, usage_allowed }] }
 *
 * 2. Boolean features: No balance fields → balance: null
 * 3. Unlimited features: Return unlimited: true, usage_allowed based on overage_allowed
 * 4. Metered features: Return required_balance and balance
 *
 * Input: CheckResult (V0.2+ format)
 * Output: CheckResponseV0 (V0_2 balances array format)
 */

export const V0_2_CheckChange = defineVersionChange({
	name: "V0.2 Check Change",
	newVersion: ApiVersion.V1_1, // Breaking change introduced in V1_1
	oldVersion: ApiVersion.V0_2, // Applied when targetVersion <= V0_2
	description: [
		"Check response transformed to balances array format",
		"Single check result object → { allowed, balances: [...] }",
	],
	affectedResources: [AffectedResource.Check],
	newSchema: TrackResponseV1Schema,
	oldSchema: TrackResponseV0Schema,
	legacyDataSchema: TrackLegacyDataSchema,
	affectsResponse: true,

	// Response: V1.1+ (CheckResult) → V0_2 (CheckResponseV0)
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof TrackResponseV1Schema>;
		legacyData?: TrackLegacyData;
	}): z.infer<typeof TrackResponseV0Schema> => {
		return {
			success: true,
		};
	},
});
