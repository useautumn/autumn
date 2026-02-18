import { z } from "zod/v4";
import {
	OnDecrease,
	OnIncrease,
} from "../../productV2Models/productItemModels/productItemEnums";
import { FixedPriceConfigSchema } from "./priceConfig/fixedPriceConfig";
import { UsagePriceConfigSchema } from "./priceConfig/usagePriceConfig";
import { BillingType } from "./priceEnums";

const ProrationConfigSchema = z.object({
	on_increase: z.nativeEnum(OnIncrease).default(OnIncrease.ProrateImmediately),
	on_decrease: z.nativeEnum(OnDecrease).default(OnDecrease.ProrateImmediately),
});

export const PriceSchema = z.object({
	id: z.string(),
	internal_product_id: z.string(),

	org_id: z.string().optional(),
	created_at: z.number().optional(),
	billing_type: z.nativeEnum(BillingType).nullish(),
	is_custom: z.boolean().optional(),
	config: FixedPriceConfigSchema.or(UsagePriceConfigSchema),

	entitlement_id: z.string().nullish(),

	proration_config: ProrationConfigSchema.nullable(),
});

export const CreatePriceSchema = z.object({
	config: FixedPriceConfigSchema.or(UsagePriceConfigSchema),
});

export type Price = z.infer<typeof PriceSchema>;
export type CreatePrice = z.infer<typeof CreatePriceSchema>;
export type ProrationConfig = z.infer<typeof ProrationConfigSchema>;
