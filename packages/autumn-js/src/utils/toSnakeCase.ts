function stringToSnakeCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.replace(/[-\s]+/g, "_")
		.toLowerCase();
}

export const toSnakeCase = <T>({
	obj,
	excludeKeys,
	excludeChildrenOf,
}: {
	obj: T;
	excludeKeys?: string[];
	excludeChildrenOf?: string[];
}): T => {
	if (Array.isArray(obj)) {
		return obj.map((item) =>
			toSnakeCase({
				obj: item as unknown as T,
				excludeKeys,
				excludeChildrenOf,
			}),
		) as T;
	} else if (obj !== null && typeof obj === "object") {
		return Object.fromEntries(
			Object.entries(obj).map(([key, value]) => {
				const snakeKey = stringToSnakeCase(key);

				// If this key is in excludeKeys, leave key and value untouched
				if (excludeKeys?.includes(key)) {
					return [key, value];
				}

				// If this key is in excludeChildrenOf, convert key but do not recurse into value
				if (excludeChildrenOf?.includes(key)) {
					return [snakeKey, value];
				}

				// Otherwise, convert key and recursively process value
				return [
					snakeKey,
					toSnakeCase({
						obj: value as unknown as T,
						excludeKeys,
						excludeChildrenOf,
					}),
				];
			}),
		) as T;
	}
	return obj as T;
};
