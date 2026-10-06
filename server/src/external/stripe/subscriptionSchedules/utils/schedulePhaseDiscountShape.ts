import type Stripe from "stripe";

type PhaseDiscount =
	| Stripe.SubscriptionSchedule.Phase.Discount
	| Stripe.SubscriptionScheduleUpdateParams.Phase.Discount;

const idOf = (ref: string | { id: string } | null | undefined) =>
	typeof ref === "string" ? ref : ref?.id;

const phaseDiscountRef = (discount: PhaseDiscount) =>
	idOf(discount.discount) ??
	idOf(discount.coupon) ??
	idOf(discount.promotion_code) ??
	"";

/** A phase's discounts as a comparable string: the discount, coupon or promotion code each applies, order-independent. */
export const schedulePhaseDiscountShape = (phase: {
	discounts?: PhaseDiscount[] | "" | null;
}) => JSON.stringify((phase.discounts || []).map(phaseDiscountRef).sort());
