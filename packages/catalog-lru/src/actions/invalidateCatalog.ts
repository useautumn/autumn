import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { bumpCatalogVersions } from "./catalogVersions.js";
import { orgEnvScope, orgScope } from "./invalidationIndex.js";

const EXPIRED_TTL_MS = 1;

export const invalidateCatalog = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): { expiredCount: number } => {
	bumpCatalogVersions({ scope, orgId, env });
	const { entries, keysByScope } = scope.state;
	const keys = [
		...(keysByScope.get(orgScope({ orgId })) ?? []),
		...(keysByScope.get(orgEnvScope({ orgId, env })) ?? []),
	];
	for (const key of keys) {
		const row = entries.peek(key);
		if (row) entries.set(key, row, { ttl: EXPIRED_TTL_MS });
	}
	return { expiredCount: keys.length };
};
