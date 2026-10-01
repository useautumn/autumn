/** The one Stripe subscription (or not-yet-started schedule) a Set Plans sheet
 * edits when the customer has several. */
export type SetPlansSubscriptionTarget = {
	key: string;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	label: string;
	canChange: boolean;
};
