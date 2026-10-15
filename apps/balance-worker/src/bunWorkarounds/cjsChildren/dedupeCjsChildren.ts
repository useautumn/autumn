import type { ModuleCache } from "./types/moduleCache.js";

/** Reading `children` makes Bun dedupe the native child list every GC rescans (oven-sh/bun#43279).
 *  Remove once Bun ships oven-sh/bun#43315. */
export function dedupeCjsChildren({ cache }: { cache: ModuleCache }): number {
	let modules = 0;
	for (const cached of Object.values(cache)) {
		void cached?.children;
		modules += 1;
	}
	return modules;
}
