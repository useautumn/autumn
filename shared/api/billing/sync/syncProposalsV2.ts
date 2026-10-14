import { z } from "zod/v4";
import type Stripe from "stripe";
import { SyncPhaseSchema, SyncPlanInstanceSchema } from "./syncParamsV1";

export const SyncProposalsV2ParamsSchema = z.object({
	customer_id: z.string(),
});

export type SyncProposalsV2Params = z.infer<typeof SyncProposalsV2ParamsSchema>;

const SyncProposalPhaseV2Schema = SyncPhaseSchema.extend({
	plans: z.array(SyncPlanInstanceSchema),
});

const BaseSyncProposalV2Schema = z.object({
	stripe_subscription_id: z.string().optional(),
	stripe_schedule_id: z.string().optional(),
	phases: z.array(SyncProposalPhaseV2Schema),

	stripe_subscription: z.unknown().nullable(),
	stripe_schedule: z.unknown().nullable(),

	already_linked_product_id: z.string().nullable(),
});

export const SyncProposalV2Schema = BaseSyncProposalV2Schema;

export type SyncProposalV2 = Omit<
	z.infer<typeof SyncProposalV2Schema>,
	"stripe_subscription" | "stripe_schedule"
> & {
	stripe_subscription: Stripe.Subscription | null;
	stripe_schedule: Stripe.SubscriptionSchedule | null;
};

export const SyncProposalsV2ResponseSchema = z.object({
	customer_id: z.string(),
	proposals: z.array(SyncProposalV2Schema),
});

export type SyncProposalsV2Response = Omit<
	z.infer<typeof SyncProposalsV2ResponseSchema>,
	"proposals"
> & {
	proposals: SyncProposalV2[];
};
