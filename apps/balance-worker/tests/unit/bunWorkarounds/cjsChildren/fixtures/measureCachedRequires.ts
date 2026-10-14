import { createRequire } from "node:module";
import { dedupeCjsChildren } from "../../../../../src/bunWorkarounds/cjsChildren/dedupeCjsChildren.js";

const require = createRequire(import.meta.url);
const parent = require("./parent.cjs") as { requireChild(): unknown };
const withWorkaround = process.argv.includes("--dedupe");
const ROUNDS = 5;
const REQUIRES_PER_ROUND = 1_000_000;

function fullGcMs(): number {
	const startedAt = performance.now();
	for (let i = 0; i < 5; i++) Bun.gc(true);
	return (performance.now() - startedAt) / 5;
}

// One sweep is enough: once `children` is read, Bun stops appending duplicates for that parent.
if (withWorkaround) dedupeCjsChildren({ cache: require.cache });
// The first round warms the heap up; growth is measured from there.
const gcMs: number[] = [];
for (let round = 0; round < ROUNDS; round++) {
	for (let i = 0; i < REQUIRES_PER_ROUND; i++) parent.requireChild();
	gcMs.push(fullGcMs());
}
process.stdout.write(JSON.stringify({ gcMs }));
