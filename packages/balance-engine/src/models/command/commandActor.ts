import { AuthType } from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const systemActorTypes = [
	"lock_sweep",
	"expiry_timer",
	"reset_cron",
	"reset",
	"migration_run",
	"auto_topup",
] as const;

export const knownCommandActorTypes = [
	...Object.values(AuthType),
	...systemActorTypes,
] as const;

export const commandActorSchema = z
	.object({
		type: nonEmptyStringSchema,
		id: nonEmptyStringSchema.optional(),
		name: nonEmptyStringSchema.optional(),
	})
	.loose();

export type SystemActorType = (typeof systemActorTypes)[number];
export type KnownCommandActorType = (typeof knownCommandActorTypes)[number];
export type CommandActor = z.infer<typeof commandActorSchema>;
