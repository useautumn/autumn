import { z } from "zod/v4";
import {
	baseCommandSchema,
	mutatingCommandSchema,
} from "../../../models/command/baseCommand.js";

/** Drops the customer's resident rows after another writer changed them in Postgres. */
export const evictCommandSchema = baseCommandSchema
	.extend({
		type: z.literal("evict"),
		/** The owner rebuilds the customer's snapshot rows after the drop: only for a customer the worker keeps writing, never on a rollback; absent is no. */
		refreshSnapshots: z.boolean().optional(),
	})
	.strict();

export type EvictCommand = z.infer<typeof evictCommandSchema>;

/** The evict as the worker logs it, under an id it mints: nothing moves, but readers learn the rows changed. */
export const loggedEvictCommandSchema = mutatingCommandSchema
	.extend({ type: z.literal("evict") })
	.strict();

export type LoggedEvictCommand = z.infer<typeof loggedEvictCommandSchema>;
