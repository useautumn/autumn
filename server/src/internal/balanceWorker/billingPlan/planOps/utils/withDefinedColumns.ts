export const withDefinedColumns = ({
	updates,
}: {
	updates: object;
}): Record<string, unknown> | null => {
	const set = Object.fromEntries(
		Object.entries(updates).filter(([, value]) => value !== undefined),
	);
	return Object.keys(set).length > 0 ? set : null;
};
