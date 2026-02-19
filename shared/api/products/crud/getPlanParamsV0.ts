import { z } from "zod/v4";

export const GetPlanParamsV0Schema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The ID of the plan to retrieve.",
	}),
	version: z.number().optional().meta({
		description:
			"The version of the plan to get. Defaults to the latest version.",
	}),
});

export type GetPlanParamsV0 = z.infer<typeof GetPlanParamsV0Schema>;
export type GetPlanParamsV0Input = z.input<typeof GetPlanParamsV0Schema>;
