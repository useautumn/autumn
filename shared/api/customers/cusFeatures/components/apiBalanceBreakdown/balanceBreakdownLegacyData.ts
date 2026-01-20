import { z } from "zod/v4";

export const BalanceBreakdownLegacyDataSchema = z.object({
  overage_allowed: z.boolean(),
  max_purchase: z.number().nullable(),
});

export type BalanceBreakdownLegacyData = z.infer<typeof BalanceBreakdownLegacyDataSchema>;
