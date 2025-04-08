import { z } from "zod";
import { AppEnv } from "../genModels.js";

export const SubscriptionSchema = z.object({
  id: z.string(),
  stripe_id: z.string().nullable(),
  stripe_schedule_id: z.string().nullable(),

  created_at: z.number(),
  // metadata: z.record(z.string(), z.any()),
  usage_features: z.array(z.string()),
  org_id: z.string(),
  env: z.nativeEnum(AppEnv),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;
