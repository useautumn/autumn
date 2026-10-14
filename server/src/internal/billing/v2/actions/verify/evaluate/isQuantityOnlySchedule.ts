import { stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";

const billingShapeOf = ({
	phase,
	isCurrentPhase = false,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	isCurrentPhase?: boolean;
}) =>
	JSON.stringify({
		priceIds: (phase.items ?? [])
			.map((item) => stripeRefToId(item.price))
			.sort((left, right) => String(left).localeCompare(String(right))),
		addInvoiceItems: (phase.add_invoice_items ?? [])
			.map((item) => stripeRefToId(item.price))
			.sort((left, right) => String(left).localeCompare(String(right))),
		trialEnd:
			isCurrentPhase &&
			phase.trial_end != null &&
			phase.trial_end === phase.end_date
				? null
				: (phase.trial_end ?? null),
		currency: phase.currency,
	});

export const isQuantityOnlySchedule = ({
	schedule,
}: {
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const currentStart = schedule.current_phase?.start_date;
	if (currentStart === undefined) return false;

	const currentPhase = schedule.phases.find(
		(phase) => phase.start_date === currentStart,
	);
	if (!currentPhase) return false;

	const futurePhases = schedule.phases.filter(
		(phase) => phase.start_date > currentStart,
	);
	if (futurePhases.length === 0) return false;

	const currentShape = billingShapeOf({
		phase: currentPhase,
		isCurrentPhase: true,
	});
	return futurePhases.every(
		(phase) => billingShapeOf({ phase }) === currentShape,
	);
};
