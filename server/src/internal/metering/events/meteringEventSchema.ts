import { z } from "zod/v4";

export const meteringEventTypes = ["deduct", "grant", "reset"] as const;

export const meteringEventSchema = z.object({
	v: z.literal(1),
	id: z.string().min(1),
	type: z.enum(meteringEventTypes),
	org_id: z.string().min(1),
	env: z.string().min(1),
	customer_id: z.string().min(1),
	feature_id: z.string().min(1),
	value: z.number().finite().positive(),
	entity_id: z.string().min(1).optional(),
	event_ts: z.number().int().nonnegative(),
});

export type MeteringEvent = z.infer<typeof meteringEventSchema>;
export type MeteringEventType = MeteringEvent["type"];

export const parseMeteringEvent = ({
	input,
}: {
	input: unknown;
}): MeteringEvent => meteringEventSchema.parse(input);
