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
