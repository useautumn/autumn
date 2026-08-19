import { z } from "zod/v4";

export const CatalogActionSchema = z
	.enum(["create", "update", "delete", "skip", "none"])
	.meta({
		description:
			"What would happen to this resource: created, updated, deleted (or archived — see will_archive), explicitly skipped, or unchanged.",
	});

export type CatalogAction = z.infer<typeof CatalogActionSchema>;
