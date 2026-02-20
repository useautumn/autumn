import { z } from "zod/v4";

export const DeletePlanParamsV2Schema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The ID of the plan to delete.",
	}),
	all_versions: z.boolean().default(false).optional().meta({
		description:
			"If true, deletes all versions of the plan. Otherwise, only deletes the latest version.",
	}),
});

export type DeletePlanParamsV2 = z.infer<typeof DeletePlanParamsV2Schema>;
export type DeletePlanParamsV2Input = z.input<typeof DeletePlanParamsV2Schema>;
