import { describe, expect, test } from "bun:test";
import { startLoopWatch } from "../../../src/threads/stats/startLoopWatch.js";

const blockFor = (ms: number) => {
	const until = performance.now() + ms;
	while (performance.now() < until) {}
};

describe("a thread's loop watch", () => {
	test("reads how long the loop has been kept from its tick, and nothing once the loop comes round", async () => {
		const loop = startLoopWatch();
		try {
			blockFor(150);
			expect(loop.lagMs()).toBeGreaterThanOrEqual(130);

			await Bun.sleep(30);
			expect(loop.lagMs()).toBeLessThan(20);
		} finally {
			loop.stop();
		}
	});
});
