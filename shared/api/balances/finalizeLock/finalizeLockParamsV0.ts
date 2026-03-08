import { z } from "zod/v4";

export const FinalizeLockParamsV0Schema = z.object({
	lock_key: z.string(),
	finalize_action: z.enum(["confirm", "release"]),
	overwrite_value: z.number(),
});

export type FinalizeLockParamsV0 = z.infer<typeof FinalizeLockParamsV0Schema>;
