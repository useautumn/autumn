import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";

export const readSubjectStateCommandSchema = baseCommandSchema
	.extend({ type: z.literal("readSubjectState"), org: commandOrgSchema })
	.loose();

export type ReadSubjectStateCommand = z.infer<
	typeof readSubjectStateCommandSchema
>;
