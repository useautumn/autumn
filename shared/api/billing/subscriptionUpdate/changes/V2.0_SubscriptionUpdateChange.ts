import type { z } from "zod/v4";
import { ApiVersion } from "../../../versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "../../../versionUtils/versionChangeUtils/VersionChange";
import { SubscriptionUpdateV0ParamsSchema } from "../subscriptionUpdateV0Params";
import { SubscriptionUpdateV1ParamsSchema } from "../subscriptionUpdateV1Params";

/**
 * V2_0_SubscriptionUpdateChange: Transforms subscription update params from V2.0 to V2.1 format
 *
 * Applied when: sourceVersion <= V2.0
 *
 * Breaking changes introduced in V2.1:
 *
 * 1. Renamed field: `product_id` → `plan_id`
 * 2. Removed fields: `entity_id`, `customer_data`, `entity_data`, `options`, invoice settings
 * 3. Added field: `plan_override` for customizations
 *
 * Input: SubscriptionUpdateV0Params (V2.0 format)
 * Output: SubscriptionUpdateV1Params (V2.1 format)
 */

export const V2_0_SubscriptionUpdateChange = defineVersionChange({
	name: "V2.1 Subscription Update Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Transforms subscription update params from V2.0 to V2.1 format",
	],
	affectedResources: [AffectedResource.ApiSubscriptionUpdate],
	newSchema: SubscriptionUpdateV1ParamsSchema,
	oldSchema: SubscriptionUpdateV0ParamsSchema,
	affectsRequest: true,
	affectsResponse: false,

	// Request: V0 (SubscriptionUpdateV0Params) → V1 (SubscriptionUpdateV1Params)
	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof SubscriptionUpdateV0ParamsSchema>;
	}): z.infer<typeof SubscriptionUpdateV1ParamsSchema> => {
		const planId = input.product_id;

		if (!planId) {
			throw new Error("product_id is required");
		}

		// if (input.items) {
		//   const planFeatures = input.items.map((item) => productV2);
		// }

		return {
			customer_id: input.customer_id,
			plan_id: planId,
		};
	},
});
