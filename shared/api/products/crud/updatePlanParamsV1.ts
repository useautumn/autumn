import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { idRegex } from "@utils/utils";
import { z } from "zod/v4";
import { BasePriceParamsSchema } from "../components/basePrice/basePrice";
import { CreatePlanParamsV1Schema } from "./createPlanParamsV1";

// const UpdatePlanBaseFieldsSchema = z.object({
// 	name: CreatePlanParamsV1Schema.shape.name.optional(),
// 	description: CreatePlanParamsV1Schema.shape.description
// 		.removeDefault()
// 		.optional(),
// 	group: CreatePlanParamsV1Schema.shape.group.removeDefault().optional(),
// 	add_on: CreatePlanParamsV1Schema.shape.add_on.removeDefault().optional(),
// 	auto_enable: CreatePlanParamsV1Schema.shape.auto_enable
// 		.removeDefault()
// 		.optional(),
// 	price: CreatePlanParamsV1Schema.shape.price.optional(),
// 	items: CreatePlanParamsV1Schema.shape.items.optional(),
// 	free_trial: CreatePlanParamsV1Schema.shape.free_trial.optional(),
// });

export const UpdatePlanParamsV1Schema =
	CreatePlanParamsV1Schema.partial().extend({
		version: z.number().optional(),
		archived: z.boolean().default(false).optional(),
		price: BasePriceParamsSchema.nullable().optional().meta({
			description:
				"The price of the plan. Set to null to remove the base price.",
		}),
		free_trial: FreeTrialParamsV1Schema.nullable().optional().meta({
			description:
				"The free trial of the plan. Set to null to remove the free trial.",
		}),
	});

export const UpdatePlanParamsV2Schema = z
	.object({
		plan_id: z
			.string()
			.nonempty()
			.regex(idRegex)
			.meta({
				description: "The ID of the plan to update.",
			}),
	})
	.extend(UpdatePlanParamsV1Schema.omit({ id: true }).shape)
	.extend({
		add_on: z.boolean().optional().meta({
			description: "Whether the plan is an add-on.",
		}),
		auto_enable: z.boolean().optional().meta({
			description: "Whether the plan is automatically enabled.",
		}),

		new_plan_id: z
			.string()
			.nonempty()
			.regex(idRegex)
			.optional()
			.meta({
				description:
					"The new ID to use for the plan. Can only be updated if the plan has not been used by any customers.",
			}),

		description: z.string().optional().meta({
			internal: true,
		}),
	});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsV1Schema>;
export type UpdatePlanParamsInput = z.input<typeof UpdatePlanParamsV1Schema>;
export type UpdatePlanParamsV2 = z.infer<typeof UpdatePlanParamsV2Schema>;
export type UpdatePlanParamsV2Input = z.input<typeof UpdatePlanParamsV2Schema>;
