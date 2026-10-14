import { z } from "zod/v4";

export const CreateEventSchema = z.object({
	customer_id: z.string().nonempty(),
	event_name: z.string().nonempty(),
	properties: z.record(z.string(), z.any()).nullish(),
	timestamp: z.number().nullish(),
	idempotency_key: z.string().nullish(),
	value: z.number().nullish(),
	set_usage: z.boolean().nullish(),
	entity_id: z.string().nullish(),
});

export type CreateEvent = z.infer<typeof CreateEventSchema>;
