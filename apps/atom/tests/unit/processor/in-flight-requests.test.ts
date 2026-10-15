/** The count a thread's hand-over waits on: every request it is deciding, so what they append is read and handed. */
import { describe, expect, test } from "bun:test";
import {
	beginRequest,
	waitForInFlight,
} from "../../../src/processor/ownership/inFlightRequests.js";

const settled = (promise: Promise<unknown>) =>
	Promise.race([promise.then(() => true), Bun.sleep(5).then(() => false)]);

describe("waiting for the requests in flight", () => {
	test("returns at once with none, and only once every begun request is done, whatever it ended in", async () => {
		expect(await waitForInFlight({ withinMs: 1_000 })).toBe(true);

		const first = beginRequest();
		const second = beginRequest();
		const idle = waitForInFlight({ withinMs: 1_000 });
		first.done();
		expect(await settled(idle)).toBe(false);
		second.done();
		expect(await settled(idle)).toBe(true);
		expect(await idle).toBe(true);
	});

	test("gives up at its deadline while a request is still going: its entries reach Autumn from here", async () => {
		const stuck = beginRequest();
		expect(await waitForInFlight({ withinMs: 5 })).toBe(false);
		stuck.done();
	});
});
