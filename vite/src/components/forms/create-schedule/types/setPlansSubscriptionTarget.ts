export type SetPlansSubscriptionTarget = {
	key: string;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	planName: string | null;
	stripeObjectId: string;
	details: string | null;
	canChange: boolean;
};
