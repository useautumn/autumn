import { z } from "zod/v4";

export const InsightsQueryBodySchema = z.object({
	query: z.string(),
});

export type InsightsQueryBody = z.infer<typeof InsightsQueryBodySchema>;

export const InsightsQueryResponseSchema = z.object({
	data: z.any(),
});

export type InsightsQueryResponse = z.infer<typeof InsightsQueryResponseSchema>;
