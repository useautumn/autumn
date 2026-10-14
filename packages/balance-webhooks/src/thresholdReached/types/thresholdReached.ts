export type ThresholdReached = {
	featureId: string;
	type: "limit_reached" | "allowance_used";
};
