import { EntitySchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The entities columns needed to resolve an entity command; picked from the shared row schema. */
export const workerEntitySchema = EntitySchema.pick({
	id: true,
	internal_id: true,
	internal_customer_id: true,
	feature_id: true,
}).strict();

export type WorkerEntity = z.infer<typeof workerEntitySchema>;
