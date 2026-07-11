import { z } from "zod/v4";
import {
	CustomerBillingControlsSchema,
	DbBillingControlsSchema,
} from "../cusModels/billingControls/customerBillingControls";
import { FeatureSchema } from "../featureModels/featureModels";
import { AppEnv } from "../genModels/genEnums";
import {
	type FullPlanLicense,
	FullPlanLicenseSchema,
} from "../licenseModels/fullPlanLicenseModel";
import { EntitlementSchema } from "./entModels/entModels";
import { FreeTrialSchema } from "./freeTrialModels/freeTrialModels";
import { PriceSchema } from "./priceModels/priceModels";
import { ProductConfigSchema } from "./productConfig/productConfig";
import { ProductMetadataSchema } from "./productMetadata";

export const ProductSchema = z.object({
	id: z.string(),
	name: z.string().min(1, "Product name cannot be empty"),
	description: z.string().nullable(),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	version: z.number(),
	group: z.string(),

	env: z.enum(AppEnv),
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),

	processor: z
		.object({
			type: z.string(),
			id: z.string(),
			additional_ids: z.array(z.string()).optional(),
		})
		.nullish(),
	base_variant_id: z.string().nullable(),
	base_internal_product_id: z.string().nullable().optional(),
	archived: z.boolean().default(false),
	config: ProductConfigSchema.default(() => ({ ignore_past_due: false })),
	...DbBillingControlsSchema.shape,
	metadata: ProductMetadataSchema.default(() => ({})),
});

export const CreateProductSchema = z.object({
	id: z.string(),
	name: z
		.string()
		.min(1, "Product name cannot be empty")
		.default("Untitled Product"),
	is_add_on: z.boolean().default(false),
	is_default: z.boolean().default(false),
	version: z.number().optional().default(1),
	group: z.string().optional().default(""),
});

export const UpdateProductSchema = z.object({
	id: z.string().nullish(),
	name: z.string().min(1, "Product name cannot be empty").optional(),
	is_add_on: z.boolean().optional(),
	is_default: z.boolean().optional(),
	group: z.string().nullish(),
	archived: z.boolean().optional(),
	config: ProductConfigSchema.partial().optional(),
	billing_controls: CustomerBillingControlsSchema.optional(),
});

/** Full product data without nested license links, enforcing one-level license hydration. */
export const FullProductWithoutLicensesSchema = ProductSchema.extend({
	description: z.string().nullable().optional().default(null),
	prices: z.array(PriceSchema),
	entitlements: z.array(EntitlementSchema.extend({ feature: FeatureSchema })),
	free_trial: FreeTrialSchema.nullish(),
	free_trials: z.array(FreeTrialSchema).nullish(),
	free_trial_ids: z.array(z.string()).nullish(),
});

export type FullProductWithoutLicenses = z.infer<
	typeof FullProductWithoutLicensesSchema
>;

export type FullProduct = FullProductWithoutLicenses & {
	licenses?: FullPlanLicense[];
};

export const FullProductSchema: z.ZodType<FullProduct> =
	FullProductWithoutLicensesSchema.extend({
		licenses: z.array(FullPlanLicenseSchema).optional(),
	});

export type ProductCounts = {
	active: number;
	canceled: number;
	custom: number;
	trialing: number;
	all: number;
};

export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
