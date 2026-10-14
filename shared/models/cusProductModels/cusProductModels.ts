import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import { parseVersion } from "@api/versionUtils/convertVersionUtils.js";
import { BillingVersion } from "@models/billingModels/context/billingContext.js";
import { ProcessorType } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { CustomerSchema } from "../cusModels/cusModels.js";
import {
	DbCustomerLicenseSchema,
	FullCustomerLicenseSchema,
} from "../licenseModels/fullCustomerLicense.js";
import { FreeTrialSchema } from "../productModels/freeTrialModels/freeTrialModels.js";
import { ProductSchema } from "../productModels/productModels.js";
import { FullCustomerEntitlementSchema } from "./cusEntModels/cusEntModels.js";
import { FullCustomerPriceSchema } from "./cusPriceModels/cusPriceModels.js";
import { CollectionMethod, CusProductStatus } from "./cusProductEnums.js";

export const FeatureOptionsSchema = z.object({
	feature_id: z.string(),
	quantity: z.number(),
	upcoming_quantity: z.number().nullish(),

	adjustable_quantity: z.boolean().nullish(),
	internal_feature_id: z.string().nullish(),
});

export const BillingCycleAnchorConfig = z.object({
	month: z.number(),
	day: z.number(),
	hour: z.number(),
	minute: z.number(),
	second: z.number(),
});

export const CusProductSchema = z.object({
	id: z.string(),
	internal_product_id: z.string(),
	/** @deprecated Snapshot of the public plan id at write time. Do not
	 * read or match on this — use `internal_product_id`, or the live
	 * `product.id` from the products join. */
	product_id: z.string(),
	internal_customer_id: z.string(),
	customer_id: z.string().nullish(),
	internal_entity_id: z.string().nullish(),
	entity_id: z.string().nullish(),
	created_at: z.number(),
	updated_at: z.number().nullable(),

	status: z.nativeEnum(CusProductStatus),
	canceled: z.boolean().default(false),

	starts_at: z.number().default(Date.now()),
	access_starts_at: z.number().optional().nullable(),
	trial_ends_at: z.number().optional().nullable(),
	billing_cycle_anchor: z.number().optional().nullable(),
	billing_cycle_anchor_resets_at: z.number().optional().nullable(),
	canceled_at: z.number().optional().nullable(),
	ended_at: z.number().optional().nullable(),

	options: z.array(FeatureOptionsSchema),
	free_trial_id: z.string().optional().nullable(),
	collection_method: z.nativeEnum(CollectionMethod),

	subscription_ids: z.array(z.string()).nullish(),
	scheduled_ids: z.array(z.string()).nullish(),
	processor: z
		.object({
			type: z.enum(ProcessorType),
			id: z.string().nullish(),
			current_period_start: z.number().nullish(),
			current_period_end: z.number().nullish(),
			original_transaction_id: z.string().nullish(),
		})
		.nullish(),

	quantity: z.number().default(1),
	api_semver: z.preprocess(
		(value) =>
			typeof value === "string" ? parseVersion({ versionStr: value }) : value,
		z.enum(ApiVersion).nullable(),
	),

	is_custom: z.boolean().default(false),
	customer_license_link_id: z.string().nullish(),
	parent_customer_license: DbCustomerLicenseSchema.nullish(),
	parent_customer_product: z
		.object({
			status: z.enum(CusProductStatus),
			subscription_ids: z.array(z.string()).nullable(),
			canceled_at: z.number().nullable(),
		})
		.nullish(),
	released_at: z.number().nullish(),

	billing_version: z.enum(BillingVersion).default(BillingVersion.V1),

	external_id: z.string().nullable(),

	stripe_checkout_session_id: z.string().nullish(),
	metadata_id: z.string().nullish(),

	previous_customer_product_id: z.string().nullish(),
	on_trial_end: z.enum(["bill", "revert"]).nullish(),
});

export const FullCusProductSchema = CusProductSchema.extend({
	customer_prices: z.array(FullCustomerPriceSchema),
	customer_entitlements: z.array(FullCustomerEntitlementSchema),

	customer: CustomerSchema.optional(),
	product: ProductSchema,
	free_trial: FreeTrialSchema.nullish(),

	customer_licenses: z.array(FullCustomerLicenseSchema).optional(),
});

export type CusProduct = z.infer<typeof CusProductSchema>;
export type FeatureOptions = z.infer<typeof FeatureOptionsSchema>;
export type FullCusProduct = z.infer<typeof FullCusProductSchema>;
