/**
 * Re-runs the two-owner detector over a finished roll's summary.json + handins.json (the boxes keep the code they booted
 * with), keeping what the run itself computed as `twoOwnerAsRun`. `bun tests/bench/rig/rigTwoOwnerRecompute.ts <run dir>`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OwnerClass } from "./rigShared.js";
import { detectTwoOwner, type HandIn, swapWindowsOf } from "./rigTwoOwner.js";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: rigTwoOwnerRecompute.ts <run dir>");
const summaryPath = join(dir, "summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const handIns = JSON.parse(
	readFileSync(join(dir, "handins.json"), "utf8"),
) as HandIn[];
const writers = summary.writers as Record<OwnerClass, string[]>;
const replicaOfWriter: Record<string, OwnerClass> = Object.fromEntries([
	...writers.a.map((writerId) => [writerId, "a"]),
	...writers.b.map((writerId) => [writerId, "b"]),
]);
const twoOwner = detectTwoOwner({
	handIns,
	replicaOfWriter,
	windows: swapWindowsOf({ marks: summary.marks }),
});
summary.twoOwnerAsRun ??= summary.twoOwner;
summary.twoOwner = twoOwner;
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(
	JSON.stringify({
		asRun: summary.twoOwnerAsRun.events,
		events: twoOwner.events,
		outside: twoOwner.outside,
		perWindow: twoOwner.perWindow,
	}),
);
