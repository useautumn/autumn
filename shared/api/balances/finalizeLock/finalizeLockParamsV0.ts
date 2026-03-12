import { z } from "zod/v4";

export const FinalizeLockParamsV0Schema = z
	.object({
		lock_id: z.string().meta({
			description: "The lock ID that was passed into the previous check call.",
		}),
		action: z.enum(["confirm", "release"]).meta({
			description:
				"Use 'confirm' to commit the deduction, or 'release' to return the held balance.",
		}),
		override_value: z.number().optional().meta({
			description:
				"Additional properties to attach to this finalize lock event.",
		}),
		properties: z.record(z.string(), z.any()).optional().meta({
			description:
				"Additional properties to attach to this finalize lock event.",
		}),
	})
	.refine(
		(data) => !(data.action === "release" && data.override_value !== undefined),
		{
			message: "override_value cannot be provided when action is release",
			path: ["override_value"],
		},
	);

export type FinalizeLockParamsV0 = z.infer<typeof FinalizeLockParamsV0Schema>;
