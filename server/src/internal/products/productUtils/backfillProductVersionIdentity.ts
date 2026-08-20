/** Absent version_slug → `v{version}`; absent active → false. Never overwrites an explicit value (including null). */
export const backfillProductVersionIdentity = ({
	product,
}: {
	product: {
		version: number;
		version_slug?: string | null;
		active?: boolean;
	};
}): void => {
	if (product.version_slug === undefined) {
		product.version_slug = `v${product.version}`;
	}
	if (product.active === undefined) {
		product.active = false;
	}
};

const isProductLike = (
	value: object,
): value is {
	version: number;
	version_slug?: string | null;
	active?: boolean;
} => {
	const product = value as Record<string, unknown>;
	return (
		typeof product.version === "number" &&
		typeof product.internal_id === "string" &&
		typeof product.org_id === "string" &&
		typeof product.is_add_on === "boolean"
	);
};

/** Mutates every product-shaped object in a metadata / cache JSON tree. */
export const backfillProductVersionIdentityInTree = ({
	value,
}: {
	value: unknown;
}): void => {
	const seen = new WeakSet<object>();

	const walk = (node: unknown): void => {
		if (node == null || typeof node !== "object") return;
		if (seen.has(node)) return;
		seen.add(node);

		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}

		if (isProductLike(node)) {
			backfillProductVersionIdentity({ product: node });
		}

		for (const child of Object.values(node)) {
			walk(child);
		}
	};

	walk(value);
};
