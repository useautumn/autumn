import type { CatalogCache } from "@autumn/catalog-lru";
import type { CjsChildrenDedupe } from "../../bunWorkarounds/cjsChildren/types/cjsChildrenDedupe.js";
import type { SubjectMapBudget } from "../../processor/writer/subjectMap/types/subjectMapBudget.js";

const MiB = 1_048_576;

/** Constant-time reads only: `v8.getHeapStatistics()` walks the heap on Bun (oven-sh/bun#42200). */
export function readMemorySignals({
	ctx,
}: {
	ctx: {
		catalogCache: Pick<CatalogCache, "size" | "sizeBytes">;
		subjectMapBudget?: Pick<SubjectMapBudget, "usedBytes">;
		cjsChildren: Pick<CjsChildrenDedupe, "cachedModules">;
	};
}) {
	const { heapUsed, rss } = process.memoryUsage();
	return {
		heapUsedMb: Math.round(heapUsed / MiB),
		rssMb: Math.round(rss / MiB),
		catalogEntries: ctx.catalogCache.size(),
		catalogMb: Math.round(ctx.catalogCache.sizeBytes() / MiB),
		subjectMapMb: ctx.subjectMapBudget
			? Math.round(ctx.subjectMapBudget.usedBytes() / MiB)
			: null,
		cachedModules: ctx.cjsChildren.cachedModules(),
	};
}
