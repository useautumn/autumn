import type Stripe from "stripe";

// A phase trialing to its own boundary says nothing about the next phase's
// billing, and can never equal its trial_end, so it reads as no trial here.
const trialEndOf = (phase: Stripe.SubscriptionSchedule.Phase) =>
	phase.trial_end != null && phase.trial_end === phase.end_date
		? null
		: (phase.trial_end ?? null);

const billingShapeOf = (phase: Stripe.SubscriptionSchedule.Phase) =>
	JSON.stringify({
		priceIds: (phase.items ?? [])
			.map((item) =>
				typeof item.price === "string" ? item.price : item.price?.id,
			)
			.sort((left, right) => String(left).localeCompare(String(right))),
		addInvoiceItems: (phase.add_invoice_items ?? [])
			.map((item) =>
				typeof item.price === "string" ? item.price : item.price?.id,
			)
			.sort((left, right) => String(left).localeCompare(String(right))),
		trialEnd: trialEndOf(phase),
		currency: phase.currency,
	});

/** A schedule whose future phases differ from the one running now only by
 * quantity is a step the subscription webhook applies, so Autumn holds no
 * phase for it and verify has nothing to compare against. */
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

	const currentShape = billingShapeOf(currentPhase);
	return futurePhases.every((phase) => billingShapeOf(phase) === currentShape);
};
