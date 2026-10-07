import type Stripe from "stripe";

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

const referencesNewCoupon = (phase: SchedulePhase) =>
	Array.isArray(phase.discounts) &&
	phase.discounts.some((discount) => discount.coupon && !discount.discount);

/** Every phase shares the subscription's discount, so the coupon's duration runs once instead of restarting per phase. */
export const linkPhaseDiscountsToSubscription = async ({
	stripeCli,
	subscriptionId,
	phases,
}: {
	stripeCli: Stripe;
	subscriptionId: string;
	phases: SchedulePhase[];
}): Promise<SchedulePhase[]> => {
	if (!phases.some(referencesNewCoupon)) return phases;

	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId, {
		expand: ["discounts"],
	});
	const discountByCouponId = new Map<string, Stripe.Discount>();
	for (const discount of subscription.discounts) {
		if (typeof discount === "string") continue;
		const coupon = discount.source.coupon;
		if (!coupon) continue;
		discountByCouponId.set(
			typeof coupon === "string" ? coupon : coupon.id,
			discount,
		);
	}

	return phases.map((phase) => {
		if (!Array.isArray(phase.discounts)) return phase;
		const phaseStart =
			typeof phase.start_date === "number" ? phase.start_date : undefined;

		return {
			...phase,
			discounts: phase.discounts.flatMap((phaseDiscount) => {
				const discount = phaseDiscount.coupon
					? discountByCouponId.get(phaseDiscount.coupon)
					: undefined;
				if (!discount || phaseDiscount.discount) return [phaseDiscount];

				const endsBeforePhase =
					discount.end !== null &&
					phaseStart !== undefined &&
					discount.end <= phaseStart;
				return endsBeforePhase ? [] : [{ discount: discount.id }];
			}),
		};
	});
};
