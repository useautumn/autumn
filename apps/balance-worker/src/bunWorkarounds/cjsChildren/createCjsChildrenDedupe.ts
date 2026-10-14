import { createRequire } from "node:module";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { dedupeCjsChildren } from "./dedupeCjsChildren.js";
import type { CjsChildrenDedupe } from "./types/cjsChildrenDedupe.js";
import type { ModuleCache } from "./types/moduleCache.js";

// Each sweep holds the thread ~40ms; a parent only needs one, so new modules are caught on a widening interval.
const FIRST_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 3_600_000;

/** Per thread: each Bun worker thread has its own module cache. Off Bun it does nothing. */
export function createCjsChildrenDedupe({
	config,
}: {
	config: { enabled: boolean };
}): CjsChildrenDedupe {
	const enabled = config.enabled && typeof Bun !== "undefined";
	let timer: ReturnType<typeof setTimeout> | undefined;
	let intervalMs = FIRST_INTERVAL_MS;
	let cachedModules: number | null = null;

	function sweep(): void {
		try {
			const cache = createRequire(import.meta.url).cache as ModuleCache;
			cachedModules = timeSync({ label: "bun.cjs_children_dedupe" }, () =>
				dedupeCjsChildren({ cache }),
			);
		} catch {
			// A workaround must never take the worker down.
		}
	}

	function scheduleNext(): void {
		timer = setTimeout(sweepAndReschedule, intervalMs);
		timer.unref();
		intervalMs = Math.min(intervalMs * 2, MAX_INTERVAL_MS);
	}

	function sweepAndReschedule(): void {
		sweep();
		scheduleNext();
	}

	function start(): void {
		if (!enabled || timer) return;
		sweepAndReschedule();
	}

	function stop(): void {
		clearTimeout(timer);
		timer = undefined;
	}

	return { start, stop, cachedModules: () => cachedModules };
}
