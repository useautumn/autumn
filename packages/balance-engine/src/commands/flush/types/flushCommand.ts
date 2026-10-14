import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";

export const flushCommandSchema = baseCommandSchema
	.extend({ type: z.literal("flush") })
	.loose();

export type FlushCommand = z.infer<typeof flushCommandSchema>;
