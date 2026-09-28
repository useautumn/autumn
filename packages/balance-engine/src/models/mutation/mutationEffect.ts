import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/** One webhook to deliver, as the Svix message; the app it goes to is the host's, from the command's org. */
export const balanceWebhookEffectSchema = z
	.object({
		type: z.literal("balance_webhook"),
		eventType: nonEmptyStringSchema,
		data: z.unknown(),
		/** Svix tags, so a customer's endpoint can filter to its own customers and entities. */
		tags: z.array(z.string()),
		idempotencyKey: nonEmptyStringSchema.optional(),
	})
	.loose();

/** One feature whose auto top-up job should run now; the job re-reads the customer and decides the rest. */
export const autoTopupEffectSchema = z
	.object({
		type: z.literal("auto_topup"),
		featureId: nonEmptyStringSchema,
		reason: z.enum(["balance_below_threshold", "threshold_settlement"]),
	})
	.loose();

// Loose members, like a command: a field a newer worker stamps must not break an older reader.
export const mutationEffectSchema = z.discriminatedUnion("type", [
	balanceWebhookEffectSchema,
	autoTopupEffectSchema,
]);

export type BalanceWebhookEffect = z.infer<typeof balanceWebhookEffectSchema>;
export type AutoTopupEffect = z.infer<typeof autoTopupEffectSchema>;
export type MutationEffect = z.infer<typeof mutationEffectSchema>;
