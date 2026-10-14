import { describe, expect, it } from "bun:test";
import { createRatePacer } from "@/utils/createRatePacer.js";

const runWithFakeTimers = async <T>(
	run: (clock: { advance: (ms: number) => void }) => Promise<T>,
) => {
	const realSetTimeout = globalThis.setTimeout;
	const RealDate = globalThis.Date;
	let currentMs = 1_000_000;
	const waits: number[] = [];

	globalThis.Date = class extends RealDate {
		constructor(...args: unknown[]) {
			if (args.length === 0) super(currentMs);
			else super(...(args as [string]));
		}
		static now() {
			return currentMs;
		}
	} as unknown as DateConstructor;
	globalThis.setTimeout = ((handler: () => void, delayMs?: number) => {
		waits.push(delayMs ?? 0);
		currentMs += delayMs ?? 0;
		queueMicrotask(handler);
		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as typeof globalThis.setTimeout;

	try {
		const result = await run({
			advance: (ms: number) => {
				currentMs += ms;
			},
		});
		return { result, waits };
	} finally {
		globalThis.setTimeout = realSetTimeout;
		globalThis.Date = RealDate;
	}
};

describe("createRatePacer", () => {
	it("spaces a burst of instant calls to the configured rate", async () => {
		const { waits } = await runWithFakeTimers(async () => {
			const pacer = createRatePacer({ requestsPerSecond: 100 });
			for (let call = 0; call < 20; call++) await pacer.takeSlot();
		});

		const totalWaitMs = waits.reduce((total, wait) => total + wait, 0);

		expect(waits).toHaveLength(19);
		expect(totalWaitMs).toBe(190);
	});

	it("does not delay calls already slower than the rate", async () => {
		const { waits } = await runWithFakeTimers(async (clock) => {
			const pacer = createRatePacer({ requestsPerSecond: 1000 });
			for (let call = 0; call < 5; call++) {
				await pacer.takeSlot();
				clock.advance(50);
			}
		});

		expect(waits).toHaveLength(0);
	});
});
