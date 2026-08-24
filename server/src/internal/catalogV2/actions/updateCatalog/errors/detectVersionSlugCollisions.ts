import type { FullProduct } from "@autumn/shared";

export type VersionSlugCollision = {
	planId: string;
	versionSlug: string;
	versions: number[];
};

/** Projected (plan id, version_slug) owned by more than one version. Null slugs ignored. */
export const detectVersionSlugCollisions = ({
	products,
}: {
	products: FullProduct[];
}): VersionSlugCollision[] => {
	const owners = new Map<string, FullProduct[]>();
	for (const product of products) {
		if (product.version_slug == null) continue;
		const key = `${product.id}\0${product.version_slug}`;
		const group = owners.get(key) ?? [];
		group.push(product);
		owners.set(key, group);
	}

	return [...owners.values()]
		.filter((group) => {
			const internalIds = new Set(group.map((product) => product.internal_id));
			return internalIds.size > 1;
		})
		.map((group) => ({
			planId: group[0].id,
			versionSlug: group[0].version_slug as string,
			versions: [...new Set(group.map((product) => product.version))].sort(
				(a, b) => a - b,
			),
		}));
};
