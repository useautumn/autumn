/** The one Stripe subscription (or not-yet-started schedule) a Set Plans sheet
 * edits when the customer has several. */
export type SetPlansSubscriptionTarget = {
	key: string;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	/** The main plan billed on it, which names the subscription. */
	planName: string | null;
	stripeObjectId: string;
	/** e.g. "Monthly · renews Nov 1, 2026"; null until Stripe has loaded. */
	details: string | null;
	canChange: boolean;
};
