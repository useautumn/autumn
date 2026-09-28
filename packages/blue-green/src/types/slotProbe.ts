import { z } from "zod/v4";

export const SlotProbeResultSchema = z.object({
	ok: z.boolean(),
	latencyMs: z.number(),
	error: z.string().optional(),
});
export type SlotProbeResult = z.infer<typeof SlotProbeResultSchema>;
