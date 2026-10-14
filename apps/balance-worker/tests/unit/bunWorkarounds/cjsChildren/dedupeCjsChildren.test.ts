import { expect, test } from "bun:test";
import { createCjsChildrenDedupe } from "../../../../src/bunWorkarounds/cjsChildren/createCjsChildrenDedupe.js";
import { dedupeCjsChildren } from "../../../../src/bunWorkarounds/cjsChildren/dedupeCjsChildren.js";

const FIXTURE = new URL("./fixtures/measureCachedRequires.ts", import.meta.url)
	.pathname;

type GcTimes = { leaked: number; deduped: number; afterMoreRequires: number };

/** A fresh process, so the only CommonJS parent requiring in a loop is the fixture's. */
async function measure(): Promise<GcTimes> {
	const child = Bun.spawn([process.execPath, FIXTURE], {
		stdout: "pipe",
		stderr: "inherit",
	});
	const output = await new Response(child.stdout).text();
	expect(await child.exited).toBe(0);
	return JSON.parse(output) as GcTimes;
}

test("reads children on every cached module", () => {
	let reads = 0;
	const cached = {
		get children() {
			reads += 1;
			return [];
		},
	};
	expect(
		dedupeCjsChildren({ cache: { a: cached, b: cached, c: undefined } }),
	).toBe(3);
	expect(reads).toBe(2);
});

test("sweeps once on start and reports what it saw; disabled, it never sweeps", () => {
	const enabled = createCjsChildrenDedupe({ config: { enabled: true } });
	expect(enabled.cachedModules()).toBeNull();
	enabled.start();
	enabled.stop();
	expect(enabled.cachedModules()).toBeGreaterThan(0);

	const disabled = createCjsChildrenDedupe({ config: { enabled: false } });
	disabled.start();
	expect(disabled.cachedModules()).toBeNull();
});

test.skipIf(typeof Bun === "undefined")(
	"cached requires slow every full GC until children are read, and stop accumulating after (oven-sh/bun#43279)",
	async () => {
		const { leaked, deduped, afterMoreRequires } = await measure();
		const leakCostMs = leaked - deduped;
		expect(leaked).toBeGreaterThan(deduped * 1.5);
		expect(afterMoreRequires - deduped).toBeLessThan(leakCostMs / 3);
	},
	30_000,
);
