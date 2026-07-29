// Coerce a cached product's `config`/`metadata` back to `{}` when Upstash cjson
// collapsed an empty object to `[]`, or the field is absent on a pre-field cache entry.
export const repairCachedProductCollections = (product: {
	config?: unknown;
	metadata?: unknown;
}): void => {
	if (!product.config || Array.isArray(product.config)) {
		product.config = {};
	}
	if (!product.metadata || Array.isArray(product.metadata)) {
		product.metadata = {};
	}
};
