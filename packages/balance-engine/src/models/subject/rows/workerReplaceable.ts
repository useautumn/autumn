import { ReplaceableSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const workerReplaceableSchema = openSchema({
	name: "workerReplaceable",
	schema: ReplaceableSchema.pick({
		id: true,
		cus_ent_id: true,
		created_at: true,
		from_entity_id: true,
		delete_next_cycle: true,
	})
		.extend({ from_entity_id: z.string().nullable().default(null) }),
});

export type WorkerReplaceableInput = z.input<typeof workerReplaceableSchema>;

export type WorkerReplaceable = z.infer<typeof workerReplaceableSchema>;
