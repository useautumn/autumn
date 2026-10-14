import type { FullProduct } from "@autumn/shared";

export type OrphanedActivePointer = {
	planId: string;
	version: number;
};

const rowsByPlanId = ({
	products,
}: {
	products: FullProduct[];
}): Map<string, FullProduct[]> => {
	const byPlanId = new Map<string, FullProduct[]>();
	for (const product of products) {
		const group = byPlanId.get(product.id) ?? [];
		group.push(product);
		byPlanId.set(product.id, group);
	}
	return byPlanId;
};

export const detectOrphanedActivePointers = ({
	products,
	removedKeys,
}: {
	products: FullProduct[];
	removedKeys: Set<string>;
}): OrphanedActivePointer[] => {
	const orphaned: OrphanedActivePointer[] = [];

	for (const [planId, rows] of rowsByPlanId({ products })) {
		const survivesArchive = rows.some((row) => !row.archived);
		if (!survivesArchive) continue;

		const activeRow = rows.find((row) => row.active);
		if (!activeRow?.archived) continue;
		if (removedKeys.has(`${planId}:${activeRow.version}`)) continue;

		orphaned.push({ planId, version: activeRow.version });
	}

	return orphaned;
};
