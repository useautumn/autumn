import { ApiCusFeatureV0Schema } from "@api/customers/cusFeatures/previousVersions/apiCusFeatureV0.js";
import { ApiCusProductV0Schema } from "@api/customers/cusPlans/previousVersions/apiCusProductV0.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiTrialsUsedSchema } from "../components/apiTrialsUsed.js";

/**
 * ApiCustomerV0Schema - Customer response format for API V0_1
 *
 * Structure: Split into separate objects
 * - customer: Core customer fields
 * - products: Array of non-add-on products
 * - add_ons: Array of add-on products
 * - entitlements: Array of customer features (V0 format - minimal fields)
 * - invoices: Array of customer invoices
 *
 * Key differences from V1:
 * - Features (entitlements) use V0 format with minimal fields (no next_reset_at, allowance, usage_limit)
 * - Products don't have items or period tracking (same as V1)
 * - Invoices always included (no expand parameter)
 */

// Core customer object (without products/features/invoices)
export const ApiCustomerV0CoreSchema = z.object({
	// Internal fields
	id: z.string().nullable(),
	name: z.string().default(""),
	email: z.string().default(""),
	fingerprint: z.string().default(""),
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
export const ApiCustomerV0Schema = z.object({
	customer: ApiCustomerV0CoreSchema,
	products: z.array(ApiCusProductV0Schema),
	add_ons: z.array(ApiCusProductV0Schema),
	entitlements: z.array(ApiCusFeatureV0Schema),
	invoices: z.array(ApiInvoiceSchema),
	trials_used: z.array(ApiTrialsUsedSchema).optional(),
});

export type ApiCustomerV0 = z.infer<typeof ApiCustomerV0Schema>;
export type ApiCustomerV0Core = z.infer<typeof ApiCustomerV0CoreSchema>;
