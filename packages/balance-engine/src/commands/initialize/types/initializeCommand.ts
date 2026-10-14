import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";

export const initializeCommandSchema = mutatingCommandSchema
	.extend({ type: z.literal("initialize") })
	.loose();

export type InitializeCommand = z.infer<typeof initializeCommandSchema>;
