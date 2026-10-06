import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../common/primitives.js";

export const balanceTotalsSchema = z
	.object({
		granted: finiteNumberSchema,
		remaining: finiteNumberSchema,
		usage: finiteNumberSchema,
	})
	.loose();

export const summaryRowTotalsSchema = z
	.object({ remaining: finiteNumberSchema, usage: finiteNumberSchema })
	.loose();

export const summaryRowSchema = z
	.object({
		id: nonEmptyStringSchema,
		planId: nonEmptyStringSchema.nullable(),
		before: summaryRowTotalsSchema.nullable(),
		after: summaryRowTotalsSchema.nullable(),
	})
	.loose();

export const mutationSummaryViewSchema = z
	.object({
		featureId: nonEmptyStringSchema,
		entityId: nonEmptyStringSchema.nullable(),
		before: balanceTotalsSchema.nullable(),
		after: balanceTotalsSchema.nullable(),
		rows: z.array(summaryRowSchema).optional(),
	})
	.loose()
	.refine((view) => view.before !== null || view.after !== null, {
		message: "A view needs a balance before or after the mutation",
	});

export const mutationSummarySchema = z.array(mutationSummaryViewSchema);

export type BalanceTotals = z.infer<typeof balanceTotalsSchema>;
export type SummaryRowTotals = z.infer<typeof summaryRowTotalsSchema>;
export type SummaryRow = z.infer<typeof summaryRowSchema>;
export type MutationSummaryView = z.infer<typeof mutationSummaryViewSchema>;
export type MutationSummary = z.infer<typeof mutationSummarySchema>;
