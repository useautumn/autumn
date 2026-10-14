import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiInvoiceV1Schema } from "../apiInvoiceV1.js";
import { ApiInvoiceV0Schema } from "../prevVersions/apiInvoiceV0.js";

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

	transformResponse: transformInvoiceToV0,
});
