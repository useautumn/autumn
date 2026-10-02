/** A later phase drops a change the phase before it already shows: that change carries over, it isn't new. */
export const withoutRepeatsOfPreviousPhase = <Change>({
	phases,
	signature,
}: {
	phases: Change[][];
	signature: (change: Change) => string;
}): Change[][] =>
	phases.map((changes, phaseIndex) => {
		const previousChanges = phases[phaseIndex - 1];
		if (!previousChanges) return changes;

		const previousSignatures = new Set(previousChanges.map(signature));
		return changes.filter(
			(change) => !previousSignatures.has(signature(change)),
		);
	});
