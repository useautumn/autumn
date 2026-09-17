import { RolloverSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** The rollovers columns deduction reads; picked from the shared row schema. */
export const workerRolloverSchema = RolloverSchema.pick({
	id: true,
	cus_ent_id: true,
	balance: true,
	usage: true,
	expires_at: true,
})
	.extend({ usage: z.number() })
	.strict();

export type WorkerRollover = z.infer<typeof workerRolloverSchema>;
