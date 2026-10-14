import { z } from "zod/v4";
import { openEnum } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const balanceWebhookEffectSchema = z
	.object({
		type: z.literal("balance_webhook"),
		eventType: nonEmptyStringSchema,
		data: z.unknown(),
		tags: z.array(z.string()),
		idempotencyKey: nonEmptyStringSchema.optional(),
	})
	.loose();

export const autoTopupEffectSchema = z
	.object({
		type: z.literal("auto_topup"),
		featureId: nonEmptyStringSchema,
		reason: openEnum({
			name: "autoTopupEffect.reason",
			values: ["balance_below_threshold", "threshold_settlement"],
		}),
	})
	.loose();

export const mutationEffectSchema = z.discriminatedUnion("type", [
	balanceWebhookEffectSchema,
	autoTopupEffectSchema,
]);

export type BalanceWebhookEffect = z.infer<typeof balanceWebhookEffectSchema>;
export type AutoTopupEffect = z.infer<typeof autoTopupEffectSchema>;
export type MutationEffect = z.infer<typeof mutationEffectSchema>;
