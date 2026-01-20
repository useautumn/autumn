import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceV1ToV0 } from "../../customers/cusFeatures/changes/V2.0_BalanceChange.js";
import { transformSubscriptionV1ToV0 } from "../../customers/cusPlans/changes/V2.0_SubscriptionChange.js";
import { EntityLegacyDataSchema } from "../entityLegacyData.js";
import { ApiEntityV2Schema } from "../apiEntityV2.js";
import { ApiEntityV1Schema } from "../prevVersions/apiEntityV1.js";

/**
 * V2_0_EntityChange: Transforms entity response TO V2.0 format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Breaking changes introduced in V2.1:
 *
 * 1. Subscriptions array simplified:
 *    - V2.1: Single "subscriptions" array containing all subscriptions
 *    - V2.0: Split into "subscriptions" (active) and "scheduled_subscriptions" (scheduled)
 *
 * 2. Balance field renames:
 *    - V2.1: "granted", "balance"
 *    - V2.0: "granted_balance", "current_balance"
 *
 * 3. Subscription field renames:
 *    - V2.1: "auto_enable"
 *    - V2.0: "default"
 *
 * Input: ApiEntityV2 (V2.1+ format)
 * Output: ApiEntityV1 (V2.0 format)
 */
export const V2_0_EntityChange = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Split subscriptions array into subscriptions + scheduled_subscriptions",
		"Transform balances from V2.1 to V2.0 format",
		"Transform subscriptions from V2.1 to V2.0 format",
	],
	affectedResources: [AffectedResource.Entity],
	newSchema: ApiEntityV2Schema,
	oldSchema: ApiEntityV1Schema,
	legacyDataSchema: EntityLegacyDataSchema,

	// Response: V2.1 → V2.0
	transformResponse: ({ input, legacyData, ctx }) => {
		// Step 1: Split subscriptions by status
		const activeSubscriptions = input.subscriptions?.filter(
			(s) => s.status === "active",
		) ?? [];
		const scheduledSubscriptions = input.subscriptions?.filter(
			(s) => s.status === "scheduled",
		) ?? [];

		// Step 2: Transform subscriptions V2.1 → V2.0
		const v0Subscriptions = activeSubscriptions.map((subscription) =>
			transformSubscriptionV1ToV0({ input: subscription }),
		);
		const v0ScheduledSubscriptions = scheduledSubscriptions.map((subscription) =>
			transformSubscriptionV1ToV0({ input: subscription }),
		);

		// Step 3: Transform balances V2.1 → V2.0
		const v0Balances: Record<string, z.infer<typeof import("../../customers/cusFeatures/previousVersions/apiBalanceV0.js").ApiBalanceV0Schema>> = {};
		if (input.balances) {
			for (const [featureId, balance] of Object.entries(input.balances)) {
				v0Balances[featureId] = transformBalanceV1ToV0({
					input: balance,
					legacyData: legacyData?.cusFeatureLegacyData[featureId],
				});
			}
		}

		// Step 4: Return V2.0 entity format
		return {
			id: input.id,
			name: input.name,
			customer_id: input.customer_id,
			created_at: input.created_at,
			env: input.env,
			subscriptions: v0Subscriptions.length > 0 ? v0Subscriptions : undefined,
			scheduled_subscriptions: v0ScheduledSubscriptions,
			balances: Object.keys(v0Balances).length > 0 ? v0Balances : undefined,

			// Expand fields (passed through unchanged)
			invoices: input.invoices,
		} satisfies z.infer<typeof ApiEntityV1Schema>;
	},
});
