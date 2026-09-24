import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";

/** Waits until Postgres holds every write the worker accepted for the customer; the copy stays. A reader of Postgres sends it first. */
export const flushCommandSchema = baseCommandSchema
	.extend({ type: z.literal("flush") })
	.strict();

export type FlushCommand = z.infer<typeof flushCommandSchema>;
