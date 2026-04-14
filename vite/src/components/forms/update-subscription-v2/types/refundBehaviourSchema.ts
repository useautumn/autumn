import { z } from "zod/v4";

export const RefundBehaviorSchema = z.enum(["refund"]);
export type RefundBehaviorValue = z.infer<typeof RefundBehaviorSchema>;
