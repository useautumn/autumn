export const toBatches = <T>({
	items,
	size,
}: {
	items: T[];
	size: number;
}): T[][] => {
	const batches: T[][] = [];
	for (let offset = 0; offset < items.length; offset += size) {
		batches.push(items.slice(offset, offset + size));
	}
	return batches;
};
