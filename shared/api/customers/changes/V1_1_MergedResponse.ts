import { ApiCustomerSchema } from "@api/customers/apiCustomer.js";
import { APICusProductSchema } from "@api/customers/components/apiCusProduct.js";
import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";

/**
 * V1_1: Customer response structure changed from split to merged
 *
 * V1_1+ format: Merged single object with features/products
 * V1_0 format: Split into {customer, products, add_ons, entitlements, invoices}
 */

// V1_1+ merged response schema
const V1_1_CustomerResponseSchema = ApiCustomerSchema;

// V1_0 split response schema
const V1_0_CustomerResponseSchema = z.object({
	customer: ApiCustomerSchema.omit({
		features: true,
		products: true,
		invoices: true,
		trials_used: true,
	}),
	products: z.array(APICusProductSchema),
	add_ons: z.array(APICusProductSchema),
	entitlements: z.array(ApiCusFeatureSchema),
	invoices: z.array(z.any()),
	trials_used: z.array(z.any()).optional(),
});

export class V1_1_MergedResponse extends VersionChange<
	typeof V1_1_CustomerResponseSchema,
	typeof V1_0_CustomerResponseSchema
> {
	readonly version = ApiVersion.V1_1;
	readonly description = "Merged customer response → split structure";
	readonly affectedResources = [AffectedResource.Customer];
	readonly affectsRequest = false;
	readonly affectsResponse = true;

	readonly newSchema = V1_1_CustomerResponseSchema;
	readonly oldSchema = V1_0_CustomerResponseSchema;

	// Response: V1_1 merged → V1_0 split
	transformResponse({
		input,
	}: {
		input: z.infer<typeof V1_1_CustomerResponseSchema>;
	}): z.infer<typeof V1_0_CustomerResponseSchema> {
		const {
			features,
			products = [],
			invoices,
			trials_used,
			...customerFields
		} = input;

		return {
			customer: customerFields,
			products: products.filter((p) => !p.is_add_on),
			add_ons: products.filter((p) => p.is_add_on),
			entitlements: Array.isArray(features)
				? features
				: Object.values(features),
			invoices: invoices || [],
			trials_used,
		};
	}
}
