import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiInvoiceV1Schema } from "../apiInvoiceV1.js";
import { ApiInvoiceV0Schema } from "../prevVersions/apiInvoiceV0.js";

/**
 * Transform invoice from V2.0 format to V1.2 format
 * Exported so it can be reused in other transformations (e.g., V1_2_CustomerChange)
 */
export function transformInvoiceToV0({
	input,
}: {
	input: z.infer<typeof ApiInvoiceV1Schema>;
}): z.infer<typeof ApiInvoiceV0Schema> {
	return {
		product_ids: input.plan_ids,
		stripe_id: input.stripe_id,
		status: input.status,
		total: input.total,
		currency: input.currency,
		created_at: input.created_at,
		hosted_invoice_url: input.hosted_invoice_url,
	};
}

/**
 * V1_2_InvoiceChange: Transforms invoice response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Product renamed to Plan:
 *    - V2.0+: "plan_ids" field contains array of plan IDs
 *    - V1.2: "product_ids" field contains array of product IDs
 *
 * Input: ApiInvoiceV1 (V2.0+ format)
 * Output: ApiInvoiceV0 (V1.2 format)
 */
export const V1_2_InvoiceChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Products renamed to plans in SDK",
		"Invoice plan_ids renamed to product_ids for V1.2 compatibility",
	],
	affectedResources: [AffectedResource.Invoice],
	newSchema: ApiInvoiceV1Schema,
	oldSchema: ApiInvoiceV0Schema,

	// Response: V2.0 → V1.2
	transformResponse: transformInvoiceToV0,
});
