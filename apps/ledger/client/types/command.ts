import { AppEnv, TrackParamsSchema } from "@autumn/shared";
import { z } from "zod/v4";

export const CommandSchema = z.object({
	id: z.string().min(1),
	org_id: z.string().min(1),
	env: z.enum(AppEnv),
	customer_id: z.string().min(1),
	entity_id: z.string().min(1).optional(),
	at: z.number().int(),
	api_version: z.string().min(1),
	kind: z.literal("track"),
	body: TrackParamsSchema,
});

export type Command = z.infer<typeof CommandSchema>;

export const CommandBatchSchema = z.array(CommandSchema).min(1).max(100);

export const CommandResultSchema = z.object({
	id: z.string().min(1),
	status: z.number().int(),
	body: z.unknown(),
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

export const CommandResultBatchSchema = z.array(CommandResultSchema);
