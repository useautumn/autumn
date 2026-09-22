import { describe, expect, it } from "bun:test";
import { createRatePacer } from "@/utils/createRatePacer.js";

describe("createRatePacer", () => {
	it("spaces a burst of instant calls to the configured rate", async () => {
		const pacer = createRatePacer({ requestsPerSecond: 100 });
		const startedAt = Date.now();

		await Promise.all(Array.from({ length: 20 }, () => pacer.takeSlot()));

		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(180);
	});

	it("does not delay calls already slower than the rate", async () => {
		const pacer = createRatePacer({ requestsPerSecond: 1000 });
		const startedAt = Date.now();

		for (let call = 0; call < 5; call++) await pacer.takeSlot();

		expect(Date.now() - startedAt).toBeLessThan(50);
	});
});
