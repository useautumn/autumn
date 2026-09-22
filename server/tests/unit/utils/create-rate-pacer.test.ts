import { describe, expect, it } from "bun:test";
import { differenceInMilliseconds } from "date-fns";
import { createRatePacer } from "@/utils/createRatePacer.js";

const elapsedSince = (startedAt: Date) =>
	differenceInMilliseconds(new Date(), startedAt);

describe("createRatePacer", () => {
	it("spaces a burst of instant calls to the configured rate", async () => {
		const pacer = createRatePacer({ requestsPerSecond: 100 });
		const startedAt = new Date();

		await Promise.all(Array.from({ length: 20 }, () => pacer.takeSlot()));

		expect(elapsedSince(startedAt)).toBeGreaterThanOrEqual(180);
	});

	it("does not delay calls already slower than the rate", async () => {
		const pacer = createRatePacer({ requestsPerSecond: 1000 });
		const startedAt = new Date();

		for (let call = 0; call < 5; call++) await pacer.takeSlot();

		expect(elapsedSince(startedAt)).toBeLessThan(50);
	});
});
