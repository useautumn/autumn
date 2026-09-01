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

/**
 * Projected plans still holding a live version while the version customers
 * attach to is archived. Archiving every version is a plan going away and is
 * left alone.
 */
export const detectOrphanedActivePointers = ({
	products,
}: {
	products: FullProduct[];
}): OrphanedActivePointer[] => {
	const orphaned: OrphanedActivePointer[] = [];

	for (const [planId, rows] of rowsByPlanId({ products })) {
		const survivesArchive = rows.some((row) => !row.archived);
		if (!survivesArchive) continue;

		const activeRow = rows.find((row) => row.active);
		if (!activeRow?.archived) continue;

		orphaned.push({ planId, version: activeRow.version });
	}

	return orphaned;
};
