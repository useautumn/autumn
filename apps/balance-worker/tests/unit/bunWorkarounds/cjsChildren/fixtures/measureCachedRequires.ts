import { createRequire } from "node:module";
import { dedupeCjsChildren } from "../../../../../src/bunWorkarounds/cjsChildren/dedupeCjsChildren.js";

const require = createRequire(import.meta.url);
const parent = require("./parent.cjs") as { requireChild(): unknown };
const REQUIRES = 5_000_000;

/** Median of several forced full GCs: single collections are noisy on shared CI runners. */
function fullGcMs(): number {
	const samples: number[] = [];
	for (let i = 0; i < 9; i++) {
		const startedAt = performance.now();
		Bun.gc(true);
		samples.push(performance.now() - startedAt);
	}
	return samples.sort((a, b) => a - b)[4] ?? 0;
}

function requireChildRepeatedly(): void {
	for (let i = 0; i < REQUIRES; i++) parent.requireChild();
}

requireChildRepeatedly();
const leaked = fullGcMs();
dedupeCjsChildren({ cache: require.cache });
const deduped = fullGcMs();
// Once `children` has been read, the same parent stops accumulating duplicates.
requireChildRepeatedly();
const afterMoreRequires = fullGcMs();
process.stdout.write(JSON.stringify({ leaked, deduped, afterMoreRequires }));
