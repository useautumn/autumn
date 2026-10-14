import { z } from "zod/v4";
import { CatalogConflictPreviewSchema } from "./catalogConflictPreview.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";
import { CatalogPlanVersioningSchema } from "./catalogVersioningPreview.js";

export const CatalogLicenseActionSchema = z
	.enum(["unchanged", "propagated", "explicit"])
	.meta({
		description:
			"How this parent's license resolved against the child edit: frozen (`unchanged`), followed the child (`propagated`), or the parent sent `licenses[]` (`explicit`).",
	});

export const CatalogLicenseParentVersionPreviewSchema =
	CatalogSiblingVersionPreviewSchema.extend({
		license_action: CatalogLicenseActionSchema.optional().meta({
			internal: true,
			description: "How this parent version treated the child edit.",
		}),
		conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
			description:
				"Child-edit slots this version's planLicense customize already overrides. The customize wins; surfaced, never blocking.",
		}),
	});

export const CatalogLicenseParentPreviewSchema =
	CatalogCorePreviewSchema.extend({
		name: z.string().meta({
			description: "Display name of the parent plan.",
		}),
		versioning: CatalogPlanVersioningSchema.optional().meta({
			description:
				"How this parent plan's target scope resolved, including whether new_version minted or fell back to existing.",
		}),
		license_action: CatalogLicenseActionSchema.optional().meta({
			internal: true,
			description: "How this parent treated the child edit.",
		}),
		conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
			description:
				"Child-edit slots this planLicense's existing customize already overrides. The customize wins; surfaced, never blocking.",
		}),
		sibling_versions: z
			.array(CatalogLicenseParentVersionPreviewSchema)
			.optional()
			.meta({
				description:
					"Other existing versions of this parent that offer the child. Omitted when only the latest version is linked.",
			}),
	});

export type CatalogLicenseAction = z.infer<typeof CatalogLicenseActionSchema>;
export type CatalogLicenseParentVersionPreview = z.infer<
	typeof CatalogLicenseParentVersionPreviewSchema
>;
export type CatalogLicenseParentPreview = z.infer<
	typeof CatalogLicenseParentPreviewSchema
>;
