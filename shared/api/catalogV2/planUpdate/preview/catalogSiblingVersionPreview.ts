import { z } from "zod/v4";
import { CatalogConflictPreviewSchema } from "./catalogConflictPreview.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";

/** Another existing version of this entry's plan. */
export const CatalogSiblingVersionPreviewSchema = CatalogCorePreviewSchema.extend(
	{
		conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
			description:
				"Slots where this version had diverged from the edited version; the edit overwrites them.",
		}),

		// selected: z.boolean().meta({
		// 	description:
		// 		"True when versioning is `all_versions` and this version receives the change.",
		// }),
	},
);

export type CatalogSiblingVersionPreview = z.infer<
	typeof CatalogSiblingVersionPreviewSchema
>;
