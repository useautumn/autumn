import type Stripe from "stripe";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";

export const updateCurSchedule = async ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be used in the future
	ctx,
	attachParams,
	schedule,
	sub,
	newPhases,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	schedule: Stripe.SubscriptionSchedule;
	sub: Stripe.Subscription;
	newPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
}) => {
	const { stripeCli } = attachParams;

	if (sub.cancel_at) {
		await stripeCli.subscriptions.update(sub.id, {
			cancel_at: null,
		});
	}

	await stripeCli.subscriptionSchedules.update(schedule.id, {
		phases: newPhases,
	});

	return schedule;
};
