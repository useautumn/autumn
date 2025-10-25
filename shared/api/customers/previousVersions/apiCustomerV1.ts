import { ApiCusFeatureV1Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV1.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiCusProductV1Schema } from "../cusPlans/previousVersions/apiCusProductV1.js";
import { ApiTrialsUsedSchema } from "./apiCustomerV3.js";

/**
 * ApiCustomerV1Schema - Customer response format for API V0_2/V1_0/V1_1 (pre V1_2)
 *
 * Structure: Split into separate objects
 * - customer: Core customer fields
 * - products: Array of non-add-on products
 * - add_ons: Array of add-on products
 * - entitlements: Array of customer features (V1 format)
 * - invoices: Array of customer invoices
 *
 * Key differences from V2:
 * - Split structure instead of merged
 * - Uses "entitlements" instead of "features"
 * - Features are ApiCusFeatureV1 (with used/allowance fields)
 * - Products are ApiCusProductV2 (same as V2, with items/period tracking)
 * - Invoices always included (no expand parameter)
 */

// Core customer object (without products/features/invoices)
export const ApiCustomerV1CoreSchema = z.object({
	// Internal fields
	id: z.string().nullable(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	fingerprint: z.string().nullable(),
	internal_id: z.string(),
	created_at: z.number(),
	env: z.enum(AppEnv),

	processor: z
		.object({
			id: z.string(),
			type: z.string(),
		})
		.nullish(),

	metadata: z.record(z.any(), z.any()).default({}),
});

// Split response structure
export const ApiCustomerV1Schema = z.object({
	customer: ApiCustomerV1CoreSchema,
	products: z.array(ApiCusProductV1Schema),
	add_ons: z.array(ApiCusProductV1Schema),
	entitlements: z.array(ApiCusFeatureV1Schema),
	invoices: z.array(ApiInvoiceSchema),
	trials_used: z.array(ApiTrialsUsedSchema).optional(),
});

export type ApiCustomerV1 = z.infer<typeof ApiCustomerV1Schema>;
export type ApiCustomerV1Core = z.infer<typeof ApiCustomerV1CoreSchema>;
