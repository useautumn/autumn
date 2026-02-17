import { CreatePlanParamsV1Schema } from "@api/products/crud/createPlanParamsV0";
import { idRegex } from "@utils/utils";
import { z } from "zod/v4";

const UpdatePlanBaseFieldsSchema = z.object({
	name: CreatePlanParamsV1Schema.shape.name.optional(),
	description: CreatePlanParamsV1Schema.shape.description
		.removeDefault()
		.optional(),
	group: CreatePlanParamsV1Schema.shape.group.removeDefault().optional(),
	add_on: CreatePlanParamsV1Schema.shape.add_on.removeDefault().optional(),
	auto_enable: CreatePlanParamsV1Schema.shape.auto_enable
		.removeDefault()
		.optional(),
	price: CreatePlanParamsV1Schema.shape.price.optional(),
	items: CreatePlanParamsV1Schema.shape.items.optional(),
	free_trial: CreatePlanParamsV1Schema.shape.free_trial.optional(),
});

export const UpdatePlanParamsV2Schema = z
	.object({
		plan_id: z.string().nonempty().regex(idRegex),
		new_plan_id: z.string().nonempty().regex(idRegex).optional(),
	})
	.extend(UpdatePlanBaseFieldsSchema.shape);

export const UpdatePlanParamsV1Schema =
	CreatePlanParamsV1Schema.partial().extend({
		version: z.number().optional(),
		archived: z.boolean().default(false).optional(),
	});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsV1Schema>;
export type UpdatePlanParamsInput = z.input<typeof UpdatePlanParamsV1Schema>;
