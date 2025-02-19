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

export interface MeteredConfig {
  filters: Expression[];
  aggregate: Aggregate;
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

export const MeteredConfigSchema = z.object({
  filters: z.array(ExpressionSchema),
  aggregate: AggregateSchema,
});
