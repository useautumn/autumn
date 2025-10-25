import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { CheckResultSchema } from "../../../core/checkModels.js";
import {
	type CheckResponseV0,
	CheckResponseV0Schema,
} from "../previousVersions/CheckResponseV0.js";

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
	newSchema: CheckResultSchema,
	oldSchema: CheckResponseV0Schema,
	affectsResponse: true,

	// Response: V1.1+ (CheckResult) → V0_2 (CheckResponseV0)
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof CheckResultSchema>;
	}): CheckResponseV0 => {
		const {
			allowed,
			feature_id,
			required_balance,
			balance,
			unlimited,
			overage_allowed,
		} = input;

		// If not allowed and no entitlements, return empty balances array
		if (!allowed && balance === null && !unlimited) {
			return {
				allowed: false,
				balances: [],
			};
		}

		// Build the balance object based on feature type
		const balanceObj: CheckResponseV0["balances"][number] = {
			feature_id,
		};

		// Case 1: Boolean/Static features (no balance, no unlimited, no overage)
		if (
			balance === null &&
			!unlimited &&
			!overage_allowed &&
			required_balance === undefined
		) {
			balanceObj.balance = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		// Case 2: Unlimited features
		if (unlimited) {
			balanceObj.balance = null;
			balanceObj.unlimited = true;
			balanceObj.usage_allowed = overage_allowed || false;
			balanceObj.required = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		// Case 3: Overage allowed (usage allowed but not unlimited)
		if (overage_allowed) {
			balanceObj.balance = balance;
			balanceObj.unlimited = false;
			balanceObj.usage_allowed = true;
			balanceObj.required = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		// Case 4: Metered features with balance tracking
		balanceObj.required = required_balance ?? null;
		balanceObj.balance = balance;

		return {
			allowed,
			balances: [balanceObj],
		};
	},
});
