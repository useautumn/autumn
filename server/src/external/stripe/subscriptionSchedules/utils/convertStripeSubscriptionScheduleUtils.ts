import type Stripe from "stripe";

/** Gets the current phase index of a Stripe subscription schedule based on nowMs. */
export const stripeSubscriptionScheduleToPhaseIndex = ({
	stripeSubscriptionSchedule,
	nowMs,
}: {
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule;
	nowMs: number;
}): number => {
	const nowSeconds = Math.floor(nowMs / 1000);

	return stripeSubscriptionSchedule.phases.findIndex(
		(phase) =>
			phase.start_date <= nowSeconds &&
			(phase.end_date ? phase.end_date > nowSeconds : true),
	);
};

export const stripeSchedulePhaseItemToPriceId = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): string => (typeof item.price === "string" ? item.price : item.price.id);

const stripeRefToId = (
	ref: string | { id: string } | null | undefined,
): string | undefined => (typeof ref === "string" ? ref : ref?.id);

const stripeScheduleDiscountToUpdateParam = (
	discount: Stripe.SubscriptionSchedule.Phase.Discount,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Discount => ({
	...(discount.coupon && { coupon: stripeRefToId(discount.coupon) }),
	...(discount.discount && { discount: stripeRefToId(discount.discount) }),
	...(discount.promotion_code && {
		promotion_code: stripeRefToId(discount.promotion_code),
	}),
});

/** Converts a live schedule phase item back into the shape an update accepts. */
export const stripeSchedulePhaseItemToUpdateParam = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Item => ({
	price: stripeSchedulePhaseItemToPriceId(item),
	quantity: item.quantity ?? undefined,
	...(item.metadata &&
		Object.keys(item.metadata).length > 0 && { metadata: item.metadata }),
	...(item.discounts.length > 0 && {
		discounts: item.discounts.map(stripeScheduleDiscountToUpdateParam),
	}),
});

/** Converts a live schedule phase back into the shape an update accepts. */
export const stripeSchedulePhaseToUpdateParam = (
	phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase => ({
	start_date: phase.start_date,
	end_date: phase.end_date ?? undefined,
	items: phase.items.map(stripeSchedulePhaseItemToUpdateParam),
	proration_behavior: phase.proration_behavior,
	...(phase.trial_end && { trial_end: phase.trial_end }),
	...(phase.billing_cycle_anchor && {
		billing_cycle_anchor: phase.billing_cycle_anchor,
	}),
	...(phase.discounts.length > 0 && {
		discounts: phase.discounts.map(stripeScheduleDiscountToUpdateParam),
	}),
	...(phase.add_invoice_items.length > 0 && {
		add_invoice_items: phase.add_invoice_items.map((invoiceItem) => ({
			price: stripeRefToId(invoiceItem.price),
			quantity: invoiceItem.quantity ?? undefined,
			...(invoiceItem.discounts.length > 0 && {
				discounts: invoiceItem.discounts.map(
					stripeScheduleDiscountToUpdateParam,
				),
			}),
		})),
	}),
});
