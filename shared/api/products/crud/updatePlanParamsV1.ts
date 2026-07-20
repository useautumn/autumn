import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { idRegex } from "@utils/utils";
import { z } from "zod/v4";
import { BasePriceParamsSchema } from "../components/basePrice/basePrice";
import { CreatePlanParamsV1Schema } from "./createPlanParamsV1";
import { MigrationParamsSchema } from "./migrationParams.js";
import { UpdateVariantParamsSchema } from "./variants/index.js";

export const UpdateLicenseParentParamsSchema = z.object({
	plan_id: z.string().nonempty().regex(idRegex),
	version: z.number().int().min(1),
});
export type UpdateLicenseParentParams = z.infer<
	typeof UpdateLicenseParentParamsSchema
>;

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
		group: CreatePlanParamsV1Schema.shape.group.removeDefault().optional(),
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
		base_plan_id: z
			.string()
			.nonempty()
			.regex(idRegex)
			.nullable()
			.optional()
			.meta({
				description:
					"The base plan this plan should be linked to as a variant. Set to null to detach it from its base plan.",
			}),
	});

export const UpdatePlanParamsV2Schema = z
	.object({
		plan_id: z.string().nonempty().regex(idRegex).meta({
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

		new_plan_id: z.string().nonempty().regex(idRegex).optional().meta({
			description:
				"The new ID to use for the plan. Can only be updated if the plan has not been used by any customers.",
		}),

		description: z.string().optional().meta({
			internal: true,
		}),

		// Edit the current version in place instead of creating a new one when
		// customers exist. Existing customers keep their current rows.
		disable_version: z.boolean().optional().meta({
			internal: true,
		}),
		all_versions: z.boolean().optional().meta({
			description:
				"Apply the update diff to all versions of this plan. Mutually exclusive with disable_version.",
		}),
		migration: MigrationParamsSchema.optional().meta({
			internal: true,
		}),
		force_version: z.boolean().optional().meta({
			description:
				"Force versioning even when no customers exist. Mutually exclusive with disable_version.",
		}),
		update_variant_ids: z.array(z.string()).optional().meta({
			description:
				"Variant plan IDs to apply this update to. Empty or omitted means no propagation.",
		}),
		update_license_parents: z
			.array(UpdateLicenseParentParamsSchema)
			.optional()
			.meta({
				description:
					"Parent plan versions that should receive this license-plan update.",
			}),
		variants: z.array(UpdateVariantParamsSchema).default([]).optional().meta({
			description:
				"Additive variant updates for this base plan. Missing variants are created when name is provided.",
		}),
		is_default: z.boolean().optional().meta({
			description:
				"Whether this is the org's default plan. Cannot be true on a variant.",
		}),
		base_plan_id: z
			.string()
			.nonempty()
			.regex(idRegex)
			.nullable()
			.optional()
			.meta({
				description:
					"The base plan this plan should be linked to as a variant. Set to null to detach it from its base plan.",
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
