export const findById = <T extends { id: string }>(items: T[], id: string): T => {
	const item = items.find((p) => p.id === id);
	if (!item) throw new Error(`Item not found: ${id}`);
	return item;
};
