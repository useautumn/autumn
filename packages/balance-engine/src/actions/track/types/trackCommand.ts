import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import {
	canonicalizeJsonValue,
	propertiesSchema,
} from "../../../common/types/jsonValue.js";
import { meteringIdentitySchema } from "../../../common/types/meteringIdentity.js";
import { nonEmptyStringSchema } from "../../../common/types/schemaUtils.js";

export const trackCommandSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("track"),
		commandId: nonEmptyStringSchema,
		requestId: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		entityId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		value: z.number().refine((value) => value !== 0),
		overageBehavior: z.enum(["cap", "reject", "overflow"]),
		properties: propertiesSchema,
		occurredAt: z.number().int().nonnegative(),
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;

// The logical payload of a command: retries share a commandId, and this
// fingerprint decides whether a retry is the same command or a conflict.
// Attempt metadata (requestId, occurredAt) is deliberately excluded.
export const trackCommandFingerprintOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.entityId,
		command.featureId,
		new Decimal(command.value).toString(),
		command.overageBehavior,
		command.properties && Object.keys(command.properties).length > 0
			? canonicalizeJsonValue(command.properties)
			: null,
	]);

// The exact key a shadow rollout compares old and new results under.
export const shadowComparisonKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.featureId,
		command.commandId,
	]);
