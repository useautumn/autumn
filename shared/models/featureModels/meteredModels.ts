import { z } from "zod";

export interface Expression {
  property: string;
  operator: string;
  value: string[];
}

export interface Aggregate {
  type: string;
  property: string | null;
}

export const ExpressionSchema = z.object({
  property: z.string(),
  operator: z.string(),
  value: z.array(z.string()),
});

export const AggregateSchema = z.object({
  type: z.string(),
  property: z.string().nullable(),
});

export const GroupBySchema = z.object({
  property: z.string(),
});

export enum FeatureUsageType {
  Single = "single_use",
  Continuous = "continuous_use",
}

export const MeteredConfigSchema = z.object({
  filters: z.array(ExpressionSchema),
  aggregate: AggregateSchema,
  group_by: GroupBySchema.nullable(),
  usage_type: z.enum([FeatureUsageType.Single, FeatureUsageType.Continuous]),
});

export type MeteredConfig = z.infer<typeof MeteredConfigSchema>;
