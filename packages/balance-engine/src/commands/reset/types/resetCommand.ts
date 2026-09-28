import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandDurabilitySchema } from "../../../models/command/commandDurability.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

/** Brings the subject's cycles up to `occurredAt`: every row due by then refills. The clock is the request. */
export const resetCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("reset"),
		org: commandOrgSchema,
		/** Subscription billing anchors by customer product id, read by the sender only for the plans whose reset they can move. */
		billingCycleAnchors: z
			.record(nonEmptyStringSchema, timestampSchema)
			.optional(),
		/** Each due pool's grant once its shares are promoted, by pool id: the sum over every share, read by the sender. */
		pooledGranted: z
			.record(nonEmptyStringSchema, finiteNumberSchema)
			.optional(),
		/** "store" keeps the sender waiting until the refill is in Postgres; absent means once Kafka has it. */
		durability: commandDurabilitySchema.optional(),
	})
	.strict();

export type ResetCommand = z.infer<typeof resetCommandSchema>;
