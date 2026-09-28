import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";

/** Drops the customer's resident rows after another writer changed them; never on the log, since no balance moves. */
export const evictCommandSchema = baseCommandSchema
	.extend({ type: z.literal("evict") })
	.strict();

export type EvictCommand = z.infer<typeof evictCommandSchema>;
