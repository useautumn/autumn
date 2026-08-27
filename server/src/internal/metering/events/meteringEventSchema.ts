import { z } from "zod/v4";

export const meteringEventTypes = ["deduct", "grant", "set", "reset"] as const;

export const meteringEventSchema = z
	.object({
		v: z.literal(1),
		id: z.string().min(1),
		type: z.enum(meteringEventTypes),
		org_id: z.string().min(1),
		env: z.string().min(1),
		customer_id: z.string().min(1),
		feature_id: z.string().min(1),
		value: z.number().finite().nonnegative(),
		entity_id: z.string().min(1).optional(),
		event_ts: z.number().int().nonnegative(),
	})
	// A "set" carries the post-state balance a write installed rather than an
	// amount to move by, so zero is a real outcome and has to be expressible.
	// For every other type zero would be an event that changes nothing.
	.refine((event) => event.type === "set" || event.value > 0, {
		message: "value must be greater than zero unless the type is set",
		path: ["value"],
	});

export type MeteringEvent = z.infer<typeof meteringEventSchema>;
export type MeteringEventType = MeteringEvent["type"];

export const parseMeteringEvent = ({
	input,
}: {
	input: unknown;
}): MeteringEvent => meteringEventSchema.parse(input);
