import { heapStats } from "bun:jsc";
import { parseSubjectState } from "@autumn/balance-engine";
import { testIdentity } from "../../fixtures/mutations.js";
import { buildScenario } from "../track-throughput/scenarios.js";

/** Heap held per byte of a resident state's JSON weight: what the subject map's byte bound means in container memory. */
const shapes: [number, number][] = [
	[1, 2],
	[4, 15],
	[10, 30],
];
for (const [products, features] of shapes) {
	const scenario = buildScenario({ name: "ratio", products, features });
	const json = JSON.stringify(scenario.stateFor({ identity: testIdentity }));
	const states: unknown[] = [];
	Bun.gc(true);
	const before = heapStats();
	for (let index = 0; index < 1_000; index++)
		states.push(parseSubjectState({ input: JSON.parse(json) }));
	Bun.gc(true);
	const after = heapStats();
	const heapPerState =
		(after.heapSize +
			after.extraMemorySize -
			before.heapSize -
			before.extraMemorySize) /
		states.length;
	console.log(
		`${products} plans x ${features} features: json ${json.length} B, heap ${Math.round(heapPerState)} B per state, ratio ${(heapPerState / json.length).toFixed(2)}`,
	);
}
