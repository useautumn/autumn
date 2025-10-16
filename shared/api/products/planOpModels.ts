import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "./apiPlan.js";
import { ApiPlanFeatureSchema } from "./planFeature/apiPlanFeature.js";

export const CreatePlanParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex),
	group: z.string().default(""),

	name: z.string().refine((val) => val.length > 0, {
		message: "name must be a non-empty string",
	}),
	description: z.string().nullable().default(null),

	add_on: z.boolean().default(false),
	default: z.boolean().default(false),

	price: z
		.object({
			amount: z.number(),
			interval: z.enum(BillingInterval),
		})
		.optional(),

	features: z.array(ApiPlanFeatureSchema).optional(),
	free_trial: ApiFreeTrialV2Schema.nullable().optional(),
});

export const UpdatePlanParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).optional(),
	group: z.string().default("").optional(),

	name: z
		.string()
		.refine((val) => val.length > 0, {
			message: "name must be a non-empty string",
		})
		.optional(),
	description: z.string().nullable().optional(),

	version: z.number().optional(),

	add_on: z.boolean().default(false).optional(),
	default: z.boolean().default(false).optional(),
	archived: z.boolean().default(false).optional(),

	price: z
		.object({
			amount: z.number().optional(),
			interval: z.enum(BillingInterval).optional(),
		})
		.optional(),

	features: z.array(ApiPlanFeatureSchema).optional(),
	free_trial: ApiFreeTrialV2Schema.nullish(),
});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});
