import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";

/** Asks for the subject as the next command would see it. `org` is what a reset due by then needs. */
export const readSubjectStateCommandSchema = baseCommandSchema
	.extend({ type: z.literal("readSubjectState"), org: commandOrgSchema })
	.strict();

export type ReadSubjectStateCommand = z.infer<
	typeof readSubjectStateCommandSchema
>;
