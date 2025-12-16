import type { z } from "zod/v4";
import { ApiVersion } from "../../../versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "../../../versionUtils/versionChangeUtils/VersionChange.js";
import { AttachBodyV1Schema } from "../attachBodyV1.js";
import { AttachBodyV0Schema } from "../prevVersions/attachBodyV0.js";

/**
 * V2_1_AttachBodyChange: Transforms attach request body from V2.0 to V2.1 format
 *
 * Applied when: sourceVersion <= V2.0
 *
 * Breaking changes introduced in V2.1:
 *
 * 1. Removed field: `customer_id`
 *
 * Input: AttachBodyV2 (V2.0 format)
 * Output: AttachBodyV2.1 (V2.1 format)
 */

export const V2_0_AttachBodyChange = defineVersionChange({
	name: "V2.1 Attach Body Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Transforms attach body from V2.0 to V2.1 format"],
	affectedResources: [AffectedResource.Attach],
	newSchema: AttachBodyV1Schema,
	oldSchema: AttachBodyV0Schema,
	affectsRequest: true,
	affectsResponse: false,

	// Request: V0 (AttachBodyV0) → V1 (AttachBodyV1)
	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof AttachBodyV0Schema>;
	}): z.infer<typeof AttachBodyV1Schema> => {
		// Get plan_id from product_id or first product_ids entry
		const planId = input.product_id ?? input.product_ids?.[0];

		if (!planId) {
			throw new Error("product_id or product_ids is required");
		}

		// Transform options to feature_quantities
		const featureQuantities = input.options?.map((opt) => ({
			feature_id: opt.feature_id,
			quantity: opt.quantity,
		}));

		// Build invoice_settings from legacy fields
		const invoiceSettings = {
			enable_immediately: input.enable_product_immediately ?? false,
			finalize_immediately: input.finalize_invoice ?? false,
		};

		// const items = input.items?.map((item) => ({
		// 	product_id: item.product_id,
		// 	quantity: item.quantity,
		// }));

		return {
			customer_id: input.customer_id,
			plan_id: planId,
			version: input.version,

			entity_id: input.entity_id ?? undefined,
			customer_data: input.customer_data ?? undefined,
			entity_data: input.entity_data,

			feature_quantities: featureQuantities,

			success_url: input.success_url,
			checkout_session_params: input.checkout_session_params,
			reward: input.reward,

			invoice: input.invoice,
			invoice_settings: invoiceSettings,

			setup_payment: input.setup_payment,
			force_checkout: input.force_checkout ?? false,
		};
	},
});
