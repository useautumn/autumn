import { z } from "zod";

export const SubscriptionSchema = z.object({
  id: z.string(),
  stripe_id: z.string().nullable(),
  stripe_schedule_id: z.string().nullable(),

  created_at: z.number(),
  // metadata: z.record(z.string(), z.any()),
  usage_features: z.array(z.string()),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;
