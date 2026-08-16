import { z } from "zod/v4";
import { CatalogConflictPreviewSchema } from "./catalogConflictPreview.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";

export const CatalogLicenseActionSchema = z
	.enum(["unchanged", "propagated", "explicit"])
	.meta({
		description:
			"How this parent's license resolved against the child edit: frozen (`unchanged`), followed the child (`propagated`), or the parent sent `licenses[]` (`explicit`).",
	});

/**
 * One license parent a child-plan edit fans out to, nested under the child's
 * direct preview row. License ops live on plan_change (upsert_licenses / remove_licenses).
 */
export const CatalogLicenseParentPreviewSchema =
	CatalogCorePreviewSchema.extend({
		name: z.string().meta({
			description: "Display name of the parent plan.",
		}),
		license_action: CatalogLicenseActionSchema.optional().meta({
			internal: true,
			description: "How this parent treated the child edit.",
		}),
		conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
			description:
				"Child-edit slots this planLicense's existing customize already overrides. The customize wins; surfaced, never blocking.",
		}),
	});

export type CatalogLicenseAction = z.infer<typeof CatalogLicenseActionSchema>;
export type CatalogLicenseParentPreview = z.infer<
	typeof CatalogLicenseParentPreviewSchema
>;
