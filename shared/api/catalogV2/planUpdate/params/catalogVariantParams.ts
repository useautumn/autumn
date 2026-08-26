import { CustomizePlanV1Schema } from "@api/billing/common/customizePlan/customizePlanV1.js";
import { ApiPlanProcessorsSchema } from "@api/products/components/processors.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

/** Base plan id for a pointer write. `null` detaches; omit leaves it unchanged. */
export const CatalogBaseVariantIdSchema = z
	.string()
	.nonempty()
	.regex(idRegex)
	.nullable()
	.optional();

/** One `variants[]` entry: declared overlay on a variant of this base. Never follow. */
export const CatalogVariantParamsSchema = z.object({
	variant_plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The variant plan this overlay applies to.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Which version of the variant this overlay targets. At most one of `version` / `version_slug`; omit both to target latest.",
	}),
	version_slug: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Which version of the variant this overlay targets, by slug. Same pin as `version`; omit both to target latest.",
	}),
	name: z.string().nonempty().optional().meta({
		description: "Display name when creating the variant if it does not exist.",
	}),
	new_plan_id: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Rename this variant to this id. Same execute path as a top-level new_plan_id.",
	}),
	archived: z.boolean().optional().meta({
		description:
			"Archive or unarchive this variant. Omit to leave archived state unchanged.",
	}),
	new_version_slug: z.string().nonempty().regex(idRegex).optional().meta({
		description:
			"Slug for the row this variant mints. Omit to inherit the base's `new_version_slug`, then `v{n}`. Ignored when this entry resolves to an existing row.",
	}),
	processors: ApiPlanProcessorsSchema.optional().meta({
		description:
			"Overrides the base plan's processors for this variant. Omit to inherit when the base processors change.",
	}),
	base_variant_id: CatalogBaseVariantIdSchema.meta({
		description:
			"Pointer write for this nested variant. Omit to link it to this base; `null` detaches it. A string must be this plan's id.",
	}),
	customize: CustomizePlanV1Schema.nullish().meta({
		description:
			"Declared overlay on this variant. `items` is PUT (replaces the list); `add_items` / `remove_items` are PATCH. Independent of `propagate`. Blocked on an archived variant unless `archived` is false in the same entry.",
	}),
}).refine(
	(data) => data.version === undefined || data.version_slug === undefined,
	{
		message:
			"Cannot specify both version and version_slug. Use one, or omit both to target the active row.",
		path: ["version_slug"],
	},
);

export type CatalogVariantParams = z.infer<typeof CatalogVariantParamsSchema>;
