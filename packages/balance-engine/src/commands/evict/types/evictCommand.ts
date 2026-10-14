import { z } from "zod/v4";
import {
	baseCommandSchema,
	mutatingCommandSchema,
} from "../../../models/command/baseCommand.js";

export const evictCommandSchema = baseCommandSchema
	.extend({
		type: z.literal("evict"),
		refreshSnapshots: z.boolean().optional(),
	})
	.loose();

export type EvictCommand = z.infer<typeof evictCommandSchema>;

const loggedEvictCommandSchema = mutatingCommandSchema
	.extend({ type: z.literal("evict") })
	.loose();

export type LoggedEvictCommand = z.infer<typeof loggedEvictCommandSchema>;
