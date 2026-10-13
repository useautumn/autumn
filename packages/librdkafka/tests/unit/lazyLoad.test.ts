import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("importing @autumn/librdkafka", () => {
	test("never loads the native addon until a client is asked for", async () => {
		const probe = `
			await import(${JSON.stringify(join(import.meta.dir, "../../src/librdkafka.ts"))});
			const loaded = Object.keys(require.cache).filter((path) => path.includes("kafka-javascript"));
			console.log(JSON.stringify(loaded));
		`;
		const child = Bun.spawnSync([process.execPath, "-e", probe], {
			stderr: "pipe",
		});
		expect(child.stderr.toString()).toBe("");
		expect(JSON.parse(child.stdout.toString())).toEqual([]);
	});
});
