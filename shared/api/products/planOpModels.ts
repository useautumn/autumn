import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "./apiPlan.js";
import { UpdatePlanFeatureSchema } from "./planFeature/planFeatureOpModels.js";

export const CreatePlanParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).meta({
		description: "Unique identifier for the plan",
		example: "pro",
	}),
	group: z
		.string()
		.meta({
			description: "Grouping identifier for organizing related plans",
			example: "tier-1",
		})
		.nullable()
		.optional()
		.default(null),

	name: z
		.string()
		.refine((val) => val.length > 0, {
			message: "name must be a non-empty string",
		})
		.meta({
			description: "Display name for the plan",
			example: "Pro Plan",
		}),
	description: z.string().nullable().optional().default(null).meta({
		description: "Optional description explaining what this plan offers",
		example: "Perfect for growing teams",
	}),

	add_on: z.boolean().optional().default(false).meta({
		description: "Whether this plan can be purchased alongside other plans",
		example: false,
	}),
	default: z.boolean().optional().default(false).meta({
		description: "Whether this is the default plan for new customers",
		example: false,
	}),

	price: z
		.object({
			amount: z.number().meta({
				description: "Price in cents (e.g., 5000 for $50.00)",
				example: 5000,
			}),
			interval: z.enum(BillingInterval).meta({
				description: "Billing frequency",
				example: "month",
			}),
		})
		.optional()
		.meta({
			description: "Base subscription price for the plan",
			example: { amount: 5000, interval: "month" },
		}),

	features: z.array(UpdatePlanFeatureSchema).optional().meta({
		description: "Features included with usage limits and pricing",
		example: [],
	}),
	free_trial: ApiFreeTrialV2Schema.nullable()
		.optional()
		.meta({
			description: "Free trial period before billing begins",
			example: {
				duration_type: "day",
				duration_length: 14,
				card_required: true,
			},
		}),
});

export const UpdatePlanParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex).optional().meta({
		description: "Unique identifier for the plan",
		example: "pro",
	}),
	group: z.string().default("").optional().meta({
		description: "Grouping identifier for organizing related plans",
		example: "tier-1",
	}),

	name: z
		.string()
		.refine((val) => val.length > 0, {
			message: "name must be a non-empty string",
		})
		.optional()
		.meta({
			description: "Display name for the plan",
			example: "Pro Plan",
		}),
	description: z.string().nullable().optional().meta({
		description: "Optional description explaining what this plan offers",
		example: "Perfect for growing teams",
	}),

	version: z.number().optional(),

	add_on: z.boolean().default(false).optional().meta({
		description: "Whether this plan can be purchased alongside other plans",
		example: false,
	}),
	default: z.boolean().default(false).optional().meta({
		description: "Whether this is the default plan for new customers",
		example: false,
	}),
	archived: z.boolean().default(false).optional().meta({
		description: "Whether this plan has been archived",
		example: false,
	}),

	price: z
		.object({
			amount: z.number().optional().meta({
				description: "Price in cents (e.g., 5000 for $50.00)",
				example: 5000,
			}),
			interval: z.enum(BillingInterval).optional().meta({
				description: "Billing frequency",
				example: "month",
			}),
		})
		.optional()
		.meta({
			description: "Base subscription price for the plan",
			example: { amount: 5000, interval: "month" },
		}),

	features: z.array(UpdatePlanFeatureSchema).optional().meta({
		description: "Features included with usage limits and pricing",
		example: [],
	}),
	free_trial: ApiFreeTrialV2Schema.nullish().meta({
		description: "Free trial period before billing begins",
		example: { duration_type: "day", duration_length: 14, card_required: true },
	}),
});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export type CreatePlanParams = z.infer<typeof CreatePlanParamsSchema>;
export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsSchema>;
