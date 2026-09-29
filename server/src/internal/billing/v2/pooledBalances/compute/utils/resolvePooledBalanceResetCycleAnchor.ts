/** A live pool keeps its anchor; a new pool anchors to its source's cycle
 * (subscription / license parent), else to customer creation. */
export const resolvePooledBalanceResetCycleAnchor = ({
	existingResetCycleAnchor,
	anchorsToSource,
	sourceResetCycleAnchor,
	customerCreatedAt,
}: {
	existingResetCycleAnchor: number | null | undefined;
	anchorsToSource: boolean;
	sourceResetCycleAnchor: number | null | undefined;
	customerCreatedAt: number;
}): number | null => {
	if (existingResetCycleAnchor !== undefined) return existingResetCycleAnchor;
	if (anchorsToSource) return sourceResetCycleAnchor ?? null;
	return customerCreatedAt;
};
