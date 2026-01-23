import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import type Stripe from "stripe";
import { logSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction";
import type { StripeSubscriptionScheduleAction } from "@/internal/billing/v2/types/billingPlan";

/**
 * Maps update phase format to create phase format (strips start_date).
 */
const toCreatePhase = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): Stripe.SubscriptionScheduleCreateParams.Phase => ({
	items: phase.items?.map((item) => ({
		price: item.price,
		quantity: item.quantity,
	})),
	end_date: typeof phase.end_date === "number" ? phase.end_date : undefined,
});

/**
 * Builds phases for updating a schedule that was created from a subscription.
 * The first phase must use the schedule's actual current phase start_date.
 */
const buildAnchoredPhases = ({
	params,
	currentPhaseStart,
}: {
	params: { phases?: Stripe.SubscriptionScheduleUpdateParams.Phase[] };
	currentPhaseStart: number;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	const inputPhases = params.phases ?? [];
	if (inputPhases.length === 0) return [];

	// First phase: preserve all fields but override start_date (can't modify current phase start)
	// Future phases: keep as-is
	return [
		{
			...inputPhases[0],
			start_date: currentPhaseStart,
		},
		...inputPhases.slice(1),
	];
};

export const executeStripeSubscriptionScheduleAction = async ({
	ctx,
	billingContext,
	subscriptionScheduleAction,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionScheduleAction: StripeSubscriptionScheduleAction;
	stripeSubscription?: Stripe.Subscription;
}): Promise<Stripe.SubscriptionSchedule | null> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	logSubscriptionScheduleAction({
		ctx,
		billingContext,
		subscriptionScheduleAction,
	});

	ctx.logger.debug(
		`[executeStripeSubscriptionScheduleAction] Executing subscription schedule operation: ${subscriptionScheduleAction.type}`,
	);

	switch (subscriptionScheduleAction.type) {
		case "create": {
			const { params } = subscriptionScheduleAction;

			// If there's an existing subscription, create schedule from it then update with phases
			if (stripeSubscription) {
				const schedule = await stripeCli.subscriptionSchedules.create({
					from_subscription: stripeSubscription.id,
				});

				const currentPhaseStart = schedule.phases[0]?.start_date;
				if (!currentPhaseStart) {
					throw new Error(
						"Cannot create schedule: missing current phase start_date",
					);
				}

				const phases = buildAnchoredPhases({ params, currentPhaseStart });

				return await stripeCli.subscriptionSchedules.update(schedule.id, {
					phases,
					end_behavior: params.end_behavior,
				});
			}

			// No subscription - create standalone schedule
			return await stripeCli.subscriptionSchedules.create({
				customer: billingContext.stripeCustomer.id,
				phases: params.phases?.map(toCreatePhase) ?? [],
				end_behavior: params.end_behavior,
			});
		}

		case "update": {
			const { stripeSubscriptionScheduleId, params } =
				subscriptionScheduleAction;

			// current_phase.start_date is validated in handleStripeBillingPlanErrors
			const currentPhaseStart = billingContext.stripeSubscriptionSchedule
				?.current_phase?.start_date as number;

			const phases = buildAnchoredPhases({ params, currentPhaseStart });

			return await stripeCli.subscriptionSchedules.update(
				stripeSubscriptionScheduleId,
				{
					...params,
					phases,
				},
			);
		}

		case "release":
			ctx.logger.debug(
				`[executeStripeSubscriptionScheduleAction] Releasing schedule: ${subscriptionScheduleAction.stripeSubscriptionScheduleId}`,
			);
			await stripeCli.subscriptionSchedules.release(
				subscriptionScheduleAction.stripeSubscriptionScheduleId,
			);
			return null;
	}
};
