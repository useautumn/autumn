import { EntitySchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** Columns a plan inserts and `customers.get` renders: absent on rows logged before them, and left out of the log's snapshot. */
export const entityRenderedColumns = {
	org_id: true,
	created_at: true,
	env: true,
	name: true,
	deleted: true,
	internal_feature_id: true,
} as const;

/** The whole entities row: the columns an entity command resolves on, and the rest a plan inserts. */
export const workerEntitySchema = EntitySchema.partial(
	entityRenderedColumns,
).strict();

export type WorkerEntity = z.infer<typeof workerEntitySchema>;
