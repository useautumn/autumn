export type ThresholdCharge = {
	chargeUnits: number;
	remainingUnits: number;
};

export const computeThresholdCharge = ({
	outstandingUnits,
	threshold,
	claimedUnits = 0,
}: {
	outstandingUnits: number;
	threshold: number;
	claimedUnits?: number;
}): ThresholdCharge | null => {
	const unclaimedUnits = outstandingUnits - claimedUnits;
	if (unclaimedUnits < threshold) return null;

	return {
		chargeUnits: threshold,
		remainingUnits: outstandingUnits - threshold,
	};
};
