import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CreatePlanItemParamsV0Schema } from "../items/crud/createPlanItemV0Params.js";
import { ApiFreeTrialV2Schema } from "../previousVersions/apiPlanV0.js";

export const PlanPriceSchema = z.object({
	amount: z.number(),
	interval: z.enum(BillingInterval),
});

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
			interval_count: z.number().optional(),
		})
		.optional(),

	features: z.array(CreatePlanItemParamsV0Schema).optional(),
	free_trial: ApiFreeTrialV2Schema.nullable().optional(),
});

export const UpdatePlanParamsSchema = CreatePlanParamsSchema.partial().extend({
	version: z.number().optional(),
	archived: z.boolean().default(false).optional(),
});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export const ListPlansQuerySchema = z.object({
	customer_id: z.string().optional(),
	entity_id: z.string().optional().meta({
		internal: true,
	}),
	include_archived: z.boolean().optional().meta({
		internal: true,
	}),
	v1_schema: z.boolean().optional().meta({
		internal: true,
	}),
});

export type CreatePlanParams = z.infer<typeof CreatePlanParamsSchema>;
export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsSchema>;
export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>;
