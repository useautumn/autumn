import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";

/** The envelope only; the rows travel beside it in the request and land on the log as the mutation's changes. */
export const initializeCommandSchema = mutatingCommandSchema
	.extend({ type: z.literal("initialize") })
	.strict();

export type InitializeCommand = z.infer<typeof initializeCommandSchema>;
