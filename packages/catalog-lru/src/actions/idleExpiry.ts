import type { CatalogRow } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

/** Sweeps at most this often per window, so an idle row outlives it by at most a tenth. */
const SWEEPS_PER_IDLE_WINDOW = 10;

export const markCatalogRowUsed = ({
	scope,
	row,
}: {
	scope: CatalogCacheScope;
	row: CatalogRow;
}): void => {
	scope.state.lastUsedAt.set(row, scope.ctx.now());
};

const isIdleSweepDue = ({
	scope,
	now,
}: {
	scope: CatalogCacheScope;
	now: number;
}): boolean =>
	now - scope.state.lastIdleSweepAt >=
	scope.ctx.config.idleExpiryMs / SWEEPS_PER_IDLE_WINDOW;

/** Callers mark the rows they touch first, so a sweep never drops a row a read or put just handed out. */
export const purgeIdleCatalogRows = ({
	scope,
}: {
	scope: CatalogCacheScope;
}): { purgedCount: number } => {
	const now = scope.ctx.now();
	if (!isIdleSweepDue({ scope, now })) return { purgedCount: 0 };
	scope.state.lastIdleSweepAt = now;
	const { entries, lastUsedAt } = scope.state;
	const idleKeys: string[] = [];
	entries.rforEach((row, key) => {
		if (now - (lastUsedAt.get(row) ?? 0) >= scope.ctx.config.idleExpiryMs)
			idleKeys.push(key);
	});
	for (const key of idleKeys) entries.delete(key);
	return { purgedCount: idleKeys.length };
};
