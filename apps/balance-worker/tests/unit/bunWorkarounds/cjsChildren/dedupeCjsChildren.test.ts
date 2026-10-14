import { expect, test } from "bun:test";
import { createCjsChildrenDedupe } from "../../../../src/bunWorkarounds/cjsChildren/createCjsChildrenDedupe.js";
import { dedupeCjsChildren } from "../../../../src/bunWorkarounds/cjsChildren/dedupeCjsChildren.js";

const FIXTURE = new URL("./fixtures/measureCachedRequires.ts", import.meta.url)
	.pathname;

/** A fresh process, so the only CommonJS parent requiring in a loop is the fixture's. */
async function measure({ dedupe }: { dedupe: boolean }): Promise<number[]> {
	const child = Bun.spawn(
		[process.execPath, FIXTURE, ...(dedupe ? ["--dedupe"] : [])],
		{ stdout: "pipe", stderr: "inherit" },
	);
	const output = await new Response(child.stdout).text();
	expect(await child.exited).toBe(0);
	return (JSON.parse(output) as { gcMs: number[] }).gcMs;
}

function growthMs({ gcMs }: { gcMs: number[] }): number {
	return (gcMs.at(-1) ?? 0) - (gcMs[0] ?? 0);
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
	"full GC grows with cached requires, and stays flat when children are read (oven-sh/bun#43279)",
	async () => {
		const without = await measure({ dedupe: false });
		const withDedupe = await measure({ dedupe: true });
		expect(growthMs({ gcMs: without })).toBeGreaterThan(1.5);
		expect(growthMs({ gcMs: withDedupe })).toBeLessThan(
			growthMs({ gcMs: without }) / 4,
		);
	},
	30_000,
);
