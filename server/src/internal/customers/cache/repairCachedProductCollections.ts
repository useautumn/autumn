// Coerce a cached product's `config`/`metadata` back to `{}` when Upstash cjson
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
