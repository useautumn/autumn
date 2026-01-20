import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceV1ToV0 } from "../cusFeatures/changes/V2.0_BalanceChange.js";
import { transformSubscriptionV1ToV0 } from "../cusPlans/changes/V2.0_SubscriptionChange.js";
import { CustomerLegacyDataSchema } from "../customerLegacyData.js";
import { ApiCustomerV5Schema } from "../apiCustomerV5.js";
import { ApiCustomerV4Schema } from "../previousVersions/apiCustomerV4.js";

/**
 * V2_0_CustomerChange: Transforms customer response TO V2.0 format
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
 * Input: ApiCustomerV5 (V2.1+ format)
 * Output: ApiCustomerV4 (V2.0 format)
 */
export const V2_0_CustomerChange = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Split subscriptions array into subscriptions + scheduled_subscriptions",
		"Transform balances from V2.1 to V2.0 format",
		"Transform subscriptions from V2.1 to V2.0 format",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerV4Schema,
	legacyDataSchema: CustomerLegacyDataSchema,

	// Response: V2.1 → V2.0
	transformResponse: ({ input, legacyData, ctx }) => {
		// Step 1: Split subscriptions by status
		const activeSubscriptions = input.subscriptions.filter(
			(s) => s.status === "active",
		);
		const scheduledSubscriptions = input.subscriptions.filter(
			(s) => s.status === "scheduled",
		);

		// Step 2: Transform subscriptions V2.1 → V2.0
		const v0Subscriptions = activeSubscriptions.map((subscription) =>
			transformSubscriptionV1ToV0({ input: subscription }),
		);
		const v0ScheduledSubscriptions = scheduledSubscriptions.map((subscription) =>
			transformSubscriptionV1ToV0({ input: subscription }),
		);

		// Step 3: Transform balances V2.1 → V2.0
		const v0Balances: Record<string, z.infer<typeof import("../cusFeatures/previousVersions/apiBalanceV0.js").ApiBalanceV0Schema>> = {};
		for (const [featureId, balance] of Object.entries(input.balances)) {
			v0Balances[featureId] = transformBalanceV1ToV0({
				input: balance,
				legacyData: legacyData?.cusFeatureLegacyData[featureId],
			});
		}

		// Step 4: Return V2.0 customer format
		return {
			autumn_id: input.autumn_id,
			id: input.id,
			name: input.name,
			email: input.email,
			created_at: input.created_at,
			fingerprint: input.fingerprint,
			stripe_id: input.stripe_id,
			env: input.env,
			metadata: input.metadata,
			subscriptions: v0Subscriptions,
			scheduled_subscriptions: v0ScheduledSubscriptions,
			balances: v0Balances,

			// Expand fields (passed through unchanged)
			invoices: input.invoices,
			entities: input.entities,
			trials_used: input.trials_used,
			rewards: input.rewards,
			referrals: input.referrals,
			payment_method: input.payment_method,
		} satisfies z.infer<typeof ApiCustomerV4Schema>;
	},
});
