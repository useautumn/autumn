/** True when an existing row takes the active pointer (not a mint). */
export const isExistingRowPromote = ({
	current,
	next,
}: {
	current: { active: boolean; internal_id: string } | null;
	next: { active: boolean; internal_id: string };
}): boolean =>
	current != null &&
	current.internal_id === next.internal_id &&
	!current.active &&
	next.active;
