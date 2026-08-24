import { z } from "zod/v4";

export const CatalogActionSchema = z
	.enum(["create", "update", "delete", "skip", "none"])
	.meta({
		description:
			"What would happen to this resource: created, updated, deleted (or archived — see will_archive), explicitly skipped, or unchanged. For plans this is per plan_id, not per version — minting a new version of a live plan is `update`, and `create` means the plan_id had no live version.",
	});

export type CatalogAction = z.infer<typeof CatalogActionSchema>;
