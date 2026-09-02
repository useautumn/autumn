/** Oldest-released unused seats beyond the spare budget (`remaining`). */
export const computeSurplusUnusedLicenseAssignments = <
	TAssignment extends { id: string },
>({
	unusedAssignments,
	remaining,
}: {
	unusedAssignments: TAssignment[];
	remaining: number;
}): TAssignment[] => {
	const keepUnused = Math.max(0, remaining);
	const surplusCount = unusedAssignments.length - keepUnused;
	if (surplusCount <= 0) return [];
	return unusedAssignments.slice(0, surplusCount);
};
