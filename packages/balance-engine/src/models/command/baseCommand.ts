import { z } from "zod/v4";
import { nonEmptyStringSchema, timestampSchema } from "../common/primitives.js";
import { meteringIdentitySchema } from "../identity/meteringIdentity.js";

/** What every command carries; each command adds its `type` and params. */
export const baseCommandSchema = z.object({
	schemaVersion: z.literal(1),
	requestId: nonEmptyStringSchema,
	identity: meteringIdentitySchema,
	occurredAt: timestampSchema,
});

export type BaseCommand = z.infer<typeof baseCommandSchema>;

/** A command that appends a mutation also carries the id the log dedups on. */
export const mutatingCommandSchema = baseCommandSchema.extend({
	commandId: nonEmptyStringSchema,
});
