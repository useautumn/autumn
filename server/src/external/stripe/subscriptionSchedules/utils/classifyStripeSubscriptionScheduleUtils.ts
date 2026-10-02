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

/** Each ongoing item bills on as the previous phase billed it; a changed quantity is a scheduled change. */
const continuesOngoingItems = ({
	lastPhase,
	previousPhase,
	ongoingStripePriceIds,
}: {
	lastPhase: Stripe.SubscriptionSchedule.Phase;
	previousPhase: Stripe.SubscriptionSchedule.Phase;
	ongoingStripePriceIds: ReadonlySet<string>;
}): boolean => {
	const previousQuantities = new Map(
		previousPhase.items.map((item) => [
			phaseItemToPriceId({ item }),
			item.quantity,
		]),
	);

	return lastPhase.items.every((item) => {
		const priceId = phaseItemToPriceId({ item });
		return (
			ongoingStripePriceIds.has(priceId) &&
			previousQuantities.has(priceId) &&
			previousQuantities.get(priceId) === item.quantity
		);
	});
};

/** Stripe has no open-ended future phase, so a released schedule ends its plans
 * with a last phase holding only ongoing plans' prices; until it starts, that's release, not a phase. */
export const findStripeScheduleReleaseTailPhase = ({
	schedule,
	ongoingStripePriceIds,
	nowSeconds,
}: {
	schedule: Stripe.SubscriptionSchedule;
	ongoingStripePriceIds: ReadonlySet<string>;
	nowSeconds: number;
}): Stripe.SubscriptionSchedule.Phase | null => {
	if (schedule.end_behavior !== "release") return null;

	const lastPhase = schedule.phases.at(-1);
	const previousPhase = schedule.phases.at(-2);
	if (!lastPhase || !previousPhase) return null;
	if (lastPhase.start_date <= nowSeconds) return null;
	if (lastPhase.items.length === 0) return null;
	if ((lastPhase.add_invoice_items ?? []).length > 0) return null;

	return continuesOngoingItems({
		lastPhase,
		previousPhase,
		ongoingStripePriceIds,
	})
		? lastPhase
		: null;
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
