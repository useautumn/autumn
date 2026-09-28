import { ReplaceableSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** A v1 allocated grant's replaceable seat: Postgres writes them, the worker only renders their count. */
export const workerReplaceableSchema = ReplaceableSchema.pick({
	id: true,
	cus_ent_id: true,
	created_at: true,
	from_entity_id: true,
	delete_next_cycle: true,
})
	// Stored nullable; a row read without the column parses as none.
	.extend({ from_entity_id: z.string().nullable().default(null) })
	.strict();

export type WorkerReplaceableInput = z.input<typeof workerReplaceableSchema>;

export type WorkerReplaceable = z.infer<typeof workerReplaceableSchema>;
