import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const resetDurabilitySchema = z.enum(["log", "store"]);
export type ResetDurability = z.infer<typeof resetDurabilitySchema>;

/** Brings the subject's cycles up to `occurredAt`: every row due by then refills. The clock is the request. */
export const resetCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("reset"),
		org: commandOrgSchema,
		/** Subscription billing anchors by customer product id, read by the sender only for the plans whose reset they can move. */
		billingCycleAnchors: z
			.record(nonEmptyStringSchema, timestampSchema)
			.optional(),
		/** Each due pool's grant after the sender promoted its due contributions, by pool id: the sum lives in Postgres, only the number travels. */
		pooledGranted: z
			.record(nonEmptyStringSchema, finiteNumberSchema)
			.optional(),
		/** "store" keeps the sender waiting until the refill is in Postgres; absent means once Kafka has it. */
		durability: resetDurabilitySchema.optional(),
	})
	.strict();

export type ResetCommand = z.infer<typeof resetCommandSchema>;
