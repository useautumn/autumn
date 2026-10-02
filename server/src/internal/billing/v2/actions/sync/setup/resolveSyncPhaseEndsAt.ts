/** A phase ends where the next starts; the last one ends at Stripe's release tail,
 * where its plans stop billing, so a plan's end date isn't dropped on sync. */
export const resolveSyncPhaseEndsAt = ({
	startsAt,
	nextPhaseStartsAt,
	releaseTailStartsAt,
}: {
	startsAt: number;
	nextPhaseStartsAt: number | null;
	releaseTailStartsAt: number | null;
}): number | null => {
	if (nextPhaseStartsAt !== null) return nextPhaseStartsAt;
	if (releaseTailStartsAt !== null && releaseTailStartsAt > startsAt) {
		return releaseTailStartsAt;
	}
	return null;
};
