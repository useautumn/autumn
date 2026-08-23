import { z } from "zod/v4";

export const CommandResultSchema = z.object({
	id: z.string().min(1),
	status: z.number().int(),
	body: z.unknown(),
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

export const CommandResultBatchSchema = z.array(CommandResultSchema);
