import { z } from "zod";
import { AppEnv } from "../genModels/genEnums.js";

export const SubscriptionSchema = z.object({
  id: z.string(),
  stripe_id: z.string().nullable(),
  stripe_schedule_id: z.string().nullable(),

  created_at: z.number(),
  // metadata: z.record(z.string(), z.any()),
  usage_features: z.array(z.string()),
  org_id: z.string(),

  current_period_start: z.number().nullable(),
  current_period_end: z.number().nullable(),

  env: z.nativeEnum(AppEnv),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;
