import { z } from "zod/v4";

export const FinalizeLockParamsV0Schema = z.object({
	lock_key: z.string(),
	action: z.enum(["confirm", "release"]),
	override_value: z.number().optional(),
});

export type FinalizeLockParamsV0 = z.infer<typeof FinalizeLockParamsV0Schema>;
