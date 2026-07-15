import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
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
	quantity: z.number(), // same as prepaid
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
	product_id: z.string(),
	internal_customer_id: z.string(),
	customer_id: z.string().nullish(),
	internal_entity_id: z.string().nullish(),
	entity_id: z.string().nullish(),
	created_at: z.number(),
	updated_at: z.number().nullable(),

	// Useful for event-driven subscriptions (and usage-based to check limits)
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

	// Fixed-cycle configuration
	subscription_ids: z.array(z.string()).nullish(),
	scheduled_ids: z.array(z.string()).nullish(),
	processor: z
		.object({
			type: z.enum(ProcessorType),
			// Processor-native id for the cus_product (e.g. RevenueCat sub/purchase id).
			id: z.string().nullish(),
			// subscription_id: z.string().optional().nullable(),
			// subscription_schedule_id: z.string().optional().nullable(),
			// last_invoice_id: z.string().optional().nullable(),
		})
		.nullish(),

	quantity: z.number().default(1),
	api_semver: z.enum(ApiVersion).nullable(),

	is_custom: z.boolean().default(false),
	// Seat rows anchor to their pool's stable link (customer_licenses.link_id);
	// successor pool rows copy the link, so transitions never touch seats.
	customer_license_link_id: z.string().nullish(),
	// Seat rows only: the pool row this seat is anchored to, plus the pool
	// parent's lifecycle snapshot (fetched status-filter-free at subject read).
	parent_customer_license: DbCustomerLicenseSchema.nullish(),
	parent_customer_product: z
		.object({
			status: z.enum(CusProductStatus),
			subscription_ids: z.array(z.string()).nullable(),
			canceled_at: z.number().nullable(),
		})
		.nullish(),
	// When the seat was released back to its pool (entity unlinked).
	released_at: z.number().nullish(),

	billing_version: z.enum(BillingVersion).default(BillingVersion.V1),

	external_id: z.string().nullable(),

	stripe_checkout_session_id: z.string().nullish(),

	previous_customer_product_id: z.string().nullish(),
	on_trial_end: z.enum(["bill", "revert"]).nullish(),
});

export const FullCusProductSchema = CusProductSchema.extend({
	customer_prices: z.array(FullCustomerPriceSchema),
	customer_entitlements: z.array(FullCustomerEntitlementSchema),

	customer: CustomerSchema.optional(),
	product: ProductSchema,
	free_trial: FreeTrialSchema.nullish(),

	// The product's customer licenses — same hierarchy as customer_prices.
	// Stitched at hydration for DB rows, set by init for planned rows; only
	// hand-built products (tests, cache converters) may omit it.
	customer_licenses: z.array(FullCustomerLicenseSchema).optional(),
});

export type CusProduct = z.infer<typeof CusProductSchema>;
export type FeatureOptions = z.infer<typeof FeatureOptionsSchema>;
export type FullCusProduct = z.infer<typeof FullCusProductSchema>;
