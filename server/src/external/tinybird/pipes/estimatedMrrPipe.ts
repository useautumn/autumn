import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const estimatedMrrPipeParamsSchema = z.object({
	org_id: z.string(),
});

export const estimatedMrrPipeRowSchema = z.object({
	estimated_mrr: z.number(),
	active_subscriptions: z.number(),
	currency: z.string(),
});

export type EstimatedMrrPipeParams = z.infer<
	typeof estimatedMrrPipeParamsSchema
>;
export type EstimatedMrrPipeRow = z.infer<typeof estimatedMrrPipeRowSchema>;

export const createEstimatedMrrPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "estimated_mrr",
		parameters: estimatedMrrPipeParamsSchema,
		data: estimatedMrrPipeRowSchema,
	});
