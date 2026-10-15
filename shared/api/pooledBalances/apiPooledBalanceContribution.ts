import { z } from "zod/v4";

export const ApiPooledBalanceContributionV0Schema = z.object({
	id: z.string(),
	entity_id: z.string().nullable().meta({
		description:
			"Entity holding the contributing plan. Null for customer-level plans.",
	}),
	entity_name: z.string().nullable().meta({
		description: "Display name of the contributing entity.",
	}),
	plan_id: z.string().meta({
		description: "The plan contributing to the pool.",
	}),
	plan_name: z.string().nullable().meta({
		description: "Display name of the contributing plan.",
	}),
	current_contribution: z.number().meta({
		description: "Amount this source contributes to the pool this cycle.",
	}),
	next_cycle_contribution: z.number().meta({
		description: "Amount this source will contribute next cycle.",
	}),
	competes: z.boolean().meta({
		description:
			"True when this source competes under a 'max' / 'min' feature: only the winning competing share counts, instead of adding up.",
	}),
	unlimited: z.boolean().meta({
		description: "True when this competing source grants unlimited usage.",
	}),
	created_at: z.number(),
});

export type ApiPooledBalanceContributionV0 = z.infer<
	typeof ApiPooledBalanceContributionV0Schema
>;
