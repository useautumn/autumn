import { z } from "zod/v4";

/** Claiming this reserved alias deletes the row so the id is a live plan again. */
export const PlanAliasReplacementSchema = z.object({
	alias_id: z.string().meta({
		description: "The reserved alias being claimed as a real plan id.",
	}),
	plan_id: z.string().meta({
		description: "The live plan that currently owns that alias.",
	}),
});

export type PlanAliasReplacement = z.infer<typeof PlanAliasReplacementSchema>;
