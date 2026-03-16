import { z } from "zod/v4";

export const GetPlanParamsV0Schema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The ID of the plan to retrieve.",
	}),
	variant_id: z.string().optional().meta({
		description: "If provided, retrieves the specified variant of the plan.",
	}),
	version: z.number().optional().meta({
		description:
			"The major version of the plan to get. Defaults to the latest version.",
	}),
	minor_version: z.number().optional().meta({
		description:
			"The minor version of the plan to get. Used together with version for exact variant lookups.",
	}),
	semver: z.string().optional().meta({
		description:
			"Semver-style version string (e.g. '2.10'). Shorthand for specifying both version and minor_version together.",
	}),
});

export type GetPlanParamsV0 = z.infer<typeof GetPlanParamsV0Schema>;
export type GetPlanParamsV0Input = z.input<typeof GetPlanParamsV0Schema>;
