import { z } from "zod/v4";
import type Stripe from "stripe";
import { SyncPhaseSchema } from "./syncParamsV1";

export const SyncProposalsV2ParamsSchema = z.object({
	customer_id: z.string(),
});

export type SyncProposalsV2Params = z.infer<typeof SyncProposalsV2ParamsSchema>;

/**
 * One sync proposal — fluid with `SyncParamsV1` so the frontend can edit
 * the draft and pass it straight to `/billing.sync`.
 *
 * `phases` mirrors `SyncParamsV1.phases` exactly; `stripe_subscription_id`
 * and `stripe_schedule_id` identify the Stripe object the proposal targets.
 *
 * Display-only extras are the raw Stripe objects (so the UI can render
 * subscription items, schedules, etc. without re-fetching) plus the
 * `already_linked_product_id` summary.
 */
const BaseSyncProposalV2Schema = z.object({
	stripe_subscription_id: z.string().optional(),
	stripe_schedule_id: z.string().optional(),
	phases: z.array(SyncPhaseSchema),

	/** Raw Stripe objects — type-cast on the consumer side. */
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
