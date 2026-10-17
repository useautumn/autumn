import { describe, expect, test } from "bun:test";
import { createInFlightWatch } from "../../../../src/health/ownNetwork/createInFlightWatch.js";

function clock() {
	const time = { now: 0 };
	function now(): number {
		return time.now;
	}
	return { time, now };
}

describe("in-flight watch", () => {
	test("an interval with nothing in flight reports nothing", () => {
		const { now } = clock();
		const watch = createInFlightWatch({ now });
		expect(watch.takeLongestMs({ now: 1_000 })).toBeNull();
	});

	test("a send still in flight reports its age at every take", async () => {
		const { time, now } = clock();
		const watch = createInFlightWatch({ now });
		const send = Promise.withResolvers<string>();
		const tracked = watch.track(() => send.promise);
		time.now = 1_200;
		expect(watch.takeLongestMs({ now: time.now })).toBe(1_200);
		time.now = 2_500;
		expect(watch.takeLongestMs({ now: time.now })).toBe(2_500);
		send.resolve("acked");
		expect(await tracked).toBe("acked");
	});

	test("a send that finished inside the interval reports its whole duration once", async () => {
		const { time, now } = clock();
		const watch = createInFlightWatch({ now });
		time.now = 100;
		const send = Promise.withResolvers<void>();
		const tracked = watch.track(() => send.promise);
		time.now = 1_400;
		send.resolve();
		await tracked;
		expect(watch.takeLongestMs({ now: 2_000 })).toBe(1_300);
		expect(watch.takeLongestMs({ now: 3_000 })).toBeNull();
	});

	test("overlapping sends report the longest, failures included", async () => {
		const { time, now } = clock();
		const watch = createInFlightWatch({ now });
		const slow = Promise.withResolvers<void>();
		const fast = Promise.withResolvers<void>();
		const slowSend = watch.track(() => slow.promise);
		time.now = 300;
		const fastSend = watch.track(() => fast.promise);
		time.now = 500;
		fast.resolve();
		await fastSend;
		time.now = 1_700;
		slow.reject(new Error("Local: Message timed out"));
		await expect(slowSend).rejects.toThrow("Local: Message timed out");
		expect(watch.takeLongestMs({ now: 2_000 })).toBe(1_700);
	});

	test("settled sends are reported to the listener with their outcome", async () => {
		const { now } = clock();
		const outcomes: boolean[] = [];
		const watch = createInFlightWatch({
			now,
			onSettled: ({ ok }) => outcomes.push(ok),
		});
		await watch.track(async () => "acked");
		await expect(
			watch.track(async () => {
				throw new Error("refused");
			}),
		).rejects.toThrow("refused");
		expect(outcomes).toEqual([true, false]);
	});
});
