import type Stripe from "stripe";
import { stripeSubscriptionScheduleToPhaseIndex } from "./convertStripeSubscriptionScheduleUtils";

/** Checks if a Stripe subscription schedule phase is current. */
export const isStripeSubscriptionSchedulePhaseCurrent = ({
	phase,
	nowSeconds,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	nowSeconds: number;
}): boolean => {
	if (nowSeconds < phase.start_date) return false;
	if (phase.end_date && nowSeconds >= phase.end_date) return false;
	return true;
};

/** Stripe keeps completed phases on an active schedule. */
export const isStripeSubscriptionSchedulePhaseEnded = ({
	phase,
	nowSeconds,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	nowSeconds: number;
}): boolean => phase.end_date != null && nowSeconds >= phase.end_date;

const phaseItemToPriceId = ({
	item,
}: {
	item: Stripe.SubscriptionSchedule.Phase.Item;
}): string => (typeof item.price === "string" ? item.price : item.price.id);

/** Stripe has no open-ended future phase, so a released schedule ends its plans
 * with a last phase holding only ongoing plans' prices; that's release, not a phase. */
export const findStripeScheduleReleaseTailPhase = ({
	schedule,
	ongoingStripePriceIds,
}: {
	schedule: Stripe.SubscriptionSchedule;
	ongoingStripePriceIds: ReadonlySet<string>;
}): Stripe.SubscriptionSchedule.Phase | null => {
	if (schedule.end_behavior !== "release") return null;

	const lastPhase = schedule.phases.at(-1);
	if (!lastPhase || schedule.phases.length < 2) return null;
	if (lastPhase.items.length === 0) return null;
	if ((lastPhase.add_invoice_items ?? []).length > 0) return null;

	const holdsOnlyOngoingPrices = lastPhase.items.every((item) =>
		ongoingStripePriceIds.has(phaseItemToPriceId({ item })),
	);

	return holdsOnlyOngoingPrices ? lastPhase : null;
};

/** Checks if a Stripe subscription schedule is in its last phase. */
export const isStripeSubscriptionScheduleInLastPhase = ({
	stripeSubscriptionSchedule,
	nowMs,
}: {
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule;
	nowMs: number;
}): boolean => {
	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	return (
		currentPhaseIndex === stripeSubscriptionSchedule.phases.length - 1 &&
		stripeSubscriptionSchedule.status !== "released"
	);
};
