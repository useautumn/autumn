/** A boundary a worker track crossed, for the deprecated `customer.threshold_reached` webhook. */
export type ThresholdReached = {
	featureId: string;
	type: "limit_reached" | "allowance_used";
};
