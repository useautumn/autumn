import {
	type CreateScheduleBillingContext,
	ErrCode,
	isFreeProduct,
	ms,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

const FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export const handleCreateScheduleErrors = async ({
	db,
	billingContext,
}: {
	db: DrizzleCli;
	billingContext: CreateScheduleBillingContext;
}) => {
	const { currentEpochMs, immediatePhase, stripeSubscriptionSchedule } =
		billingContext;

	if (
		billingContext.checkoutMode === "stripe_checkout" &&
		billingContext.enablePlanImmediately &&
		(billingContext.adjustableFeatureQuantities?.length ?? 0) > 0
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately cannot be used with adjustable feature quantities — set adjustable_quantity to false on each option, or remove enable_plan_immediately.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Updates reuse the existing schedule's current-phase start_date downstream
	// (see executeStripeSubscriptionScheduleAction.buildAnchoredPhases), so the
	// caller-supplied starts_at for phase 0 is effectively ignored. The
	// immediate-start guard only makes sense on creation.
	if (
		!stripeSubscriptionSchedule &&
		(immediatePhase.starts_at < currentEpochMs - FIRST_PHASE_TOLERANCE_MS ||
			immediatePhase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS)
	) {
		throw new RecaseError({
			message: "The first phase must start immediately",
			statusCode: 400,
		});
	}

	const allImmediateProductsFree = billingContext.fullProducts.every(
		(product) => isFreeProduct({ prices: product.prices }),
	);

	if (allImmediateProductsFree && billingContext.stripeSubscription) {
		const subId = billingContext.stripeSubscription.id;

		const productsOnSub =
			billingContext.fullCustomer.customer_products.filter((cp) =>
				cp.subscription_ids?.includes(subId),
			);

		const transitioningOutIds = new Set(
			billingContext.productContexts
				.map((ctx) => ctx.currentCustomerProduct?.id)
				.filter(Boolean),
		);

		const subscriptionWillBeCanceled =
			productsOnSub.length > 0 &&
			productsOnSub.every((cp) => transitioningOutIds.has(cp.id));

		if (subscriptionWillBeCanceled) {
			throw new RecaseError({
				message:
					"Cannot create a schedule with a free first phase while the customer has an active subscription. Please cancel the existing subscription first.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
