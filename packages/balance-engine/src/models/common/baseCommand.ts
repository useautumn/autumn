import { z } from "zod/v4";
import { meteringIdentitySchema } from "../meteringIdentity.js";
import { nonEmptyStringSchema, timestampSchema } from "./primitives.js";

/** What every command carries; each command adds its `type` and params. */
export const baseCommandSchema = z.object({
	schemaVersion: z.literal(1),
	requestId: nonEmptyStringSchema,
	identity: meteringIdentitySchema,
	occurredAt: timestampSchema,
});

/** A command that appends a mutation also carries the id the log dedups on. */
export const mutatingCommandSchema = baseCommandSchema.extend({
	commandId: nonEmptyStringSchema,
});
