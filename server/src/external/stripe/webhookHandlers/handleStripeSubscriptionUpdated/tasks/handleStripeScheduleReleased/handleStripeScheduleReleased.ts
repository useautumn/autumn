import { cp, type FullCusProduct } from "@autumn/shared";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	trackCustomerProductDeletion,
	trackCustomerProductUpdate,
} from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { getReleasedStripeScheduleId } from "./getReleasedStripeScheduleId";

/** A phase boundary stamps `ended_at` without canceling; a real cancellation
 * sets `canceled`, and is left to the cancel and renew tasks. */
const endsAtPhaseBoundary = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) =>
	customerProduct.ended_at != null &&
	!customerProduct.canceled &&
	!customerProduct.canceled_at;

/**
 * A schedule released outside Autumn never runs its later phases, so the plans
 * on the subscription stop ending at the phase boundary and the scheduled
 * next-phase plans are dropped.
 */
export const handleStripeScheduleReleased = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}) => {
	const { stripeSubscription, customerProducts } = subscriptionUpdatedContext;

	const releasedScheduleId = getReleasedStripeScheduleId({
		subscriptionUpdatedContext,
	});
	if (!releasedScheduleId) return;

	// Autumn's own releases update the customer products in the same action.
	if (isAutumnOriginatedStripeEvent({ event: ctx.stripeEvent })) return;

	const subscriptionIsEnding =
		stripeSubscription.cancel_at !== null ||
		stripeSubscription.cancel_at_period_end;
	if (subscriptionIsEnding) return;

	for (const customerProduct of [...customerProducts]) {
		const isScheduledOnReleasedSchedule = cp(customerProduct)
			.scheduled()
			.onStripeSchedule({
				stripeSubscriptionScheduleId: releasedScheduleId,
			}).valid;

		if (isScheduledOnReleasedSchedule) {
			await CusProductService.delete({
				ctx,
				cusProductId: customerProduct.id,
			});
			trackCustomerProductDeletion({
				eventContext: subscriptionUpdatedContext,
				customerProduct,
			});
			continue;
		}

		const isActiveOnSubscription = cp(customerProduct)
			.hasActiveStatus()
			.onStripeSubscription({
				stripeSubscriptionId: stripeSubscription.id,
			}).valid;
		if (!isActiveOnSubscription || !endsAtPhaseBoundary({ customerProduct }))
			continue;

		const updates = {
			ended_at: null,
			scheduled_ids: (customerProduct.scheduled_ids ?? []).filter(
				(scheduleId) => scheduleId !== releasedScheduleId,
			),
		};
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});
		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});
	}

	ctx.logger.info(
		`[handleStripeScheduleReleased] schedule ${releasedScheduleId} released on ${stripeSubscription.id}`,
	);
};
