import { z } from "zod";

export const EventSchema = z.object({
  // Internal usage
  id: z.string(),
  env: z.string(),
  org_id: z.string(),

  // Submitted by the client
  customer_id: z.string().nonempty(),
  event_name: z.string().nonempty(),

  // Optional
  properties: z.record(z.string(), z.any()).optional(),
  idempotency_key: z.string().optional(),
  timestamp: z.number().optional(),
});

export const CreateEventSchema = EventSchema.omit({
  id: true,
  env: true,
  org_id: true,
});

export type Event = z.infer<typeof EventSchema>;
