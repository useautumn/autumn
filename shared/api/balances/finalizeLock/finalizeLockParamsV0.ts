import { z } from "zod/v4";

export const FinalizeLockParamsV0Schema = z
	.object({
		lock_id: z.string(),
		action: z.enum(["confirm", "release"]),
		override_value: z.number().optional(),
	})
	.refine(
		(data) => !(data.action === "release" && data.override_value !== undefined),
		{
			message: "override_value cannot be provided when action is release",
			path: ["override_value"],
		},
	);

export type FinalizeLockParamsV0 = z.infer<typeof FinalizeLockParamsV0Schema>;
