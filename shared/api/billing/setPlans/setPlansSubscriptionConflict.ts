import { z } from "zod/v4";

/** Error details when a set_plans request targets one subscription but would
 * change a plan billed on another; the dashboard renders it as a switch link. */
export const SetPlansSubscriptionConflictSchema = z.object({
	type: z.literal("plan_on_another_subscription"),
	conflict: z.enum(["replaces", "already_billed"]),
	requested_plan_name: z.string(),
	conflicting_plan_name: z.string(),
	stripe_subscription_id: z.string(),
	subscription_plan_name: z.string(),
});

export type SetPlansSubscriptionConflict = z.infer<
	typeof SetPlansSubscriptionConflictSchema
>;
