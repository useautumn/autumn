import { EntitySchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const entityRenderedColumns = {
	org_id: true,
	created_at: true,
	env: true,
	name: true,
	deleted: true,
	internal_feature_id: true,
} as const;

export const workerEntitySchema = openSchema({
	name: "workerEntity",
	schema: EntitySchema.partial(entityRenderedColumns),
});

export type WorkerEntity = z.infer<typeof workerEntitySchema>;
