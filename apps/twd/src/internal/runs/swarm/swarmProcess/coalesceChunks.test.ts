import { describe, expect, test } from "bun:test";
import { coalesceChunks } from "./coalesceChunks.ts";

describe("coalesceChunks", () => {
	test("many chunks inside one window reach the consumer as one call", async () => {
		const seen: string[] = [];
		const c = coalesceChunks({ onChunk: (t) => seen.push(t), intervalMs: 20 });
		for (let i = 0; i < 500; i++) c.push(`${i},`);
		expect(seen).toHaveLength(0);
		await Bun.sleep(40);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.split(",").length).toBe(501);
	});

	test("flush delivers what's left immediately, in order", () => {
		const seen: string[] = [];
		const c = coalesceChunks({
			onChunk: (t) => seen.push(t),
			intervalMs: 1_000,
		});
		c.push("a");
		c.push("b");
		c.flush();
		expect(seen).toEqual(["ab"]);
		c.flush();
		expect(seen).toEqual(["ab"]);
	});
});
