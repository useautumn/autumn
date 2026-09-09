export const mergeEntityMetadata = ({
	existing,
	incoming,
}: {
	existing?: Record<string, unknown> | null;
	incoming: Record<string, unknown>;
}): Record<string, unknown> => {
	const merged = { ...(existing ?? {}) };
	for (const [key, value] of Object.entries(incoming)) {
		if (value === null) {
			delete merged[key];
		} else {
			merged[key] = value;
		}
	}
	return merged;
};
