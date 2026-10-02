import { describe, expect, test } from "bun:test";
import { createSubjectLoadGate } from "../../../src/external/postgres/createSubjectLoadGate.js";

function createHeldLoad<Value>({ value }: { value: Value }) {
	let release = () => {};
	let fail = (_cause: unknown) => {};
	let started = false;
	const held = new Promise<Value>((resolve, reject) => {
		release = () => resolve(value);
		fail = reject;
	});
	return {
		load: () => {
			started = true;
			return held;
		},
		started: () => started,
		release,
		fail,
	};
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("subject load gate", () => {
	test("runs at most its limit at once and starts the rest in arrival order", async () => {
		const gate = createSubjectLoadGate({ config: { limit: 2 } });
		const loads = [1, 2, 3, 4].map((value) => createHeldLoad({ value }));
		const results = loads.map(({ load }) => gate.run(load));
		await settle();

		expect(loads.map(({ started }) => started())).toEqual([
			true,
			true,
			false,
			false,
		]);
		expect(gate.snapshot()).toEqual({ running: 2, queued: 2 });

		loads[1]?.release();
		await settle();
		expect(loads.map(({ started }) => started())).toEqual([
			true,
			true,
			true,
			false,
		]);

		for (const held of loads) held.release();
		expect(await Promise.all(results)).toEqual([1, 2, 3, 4]);
		expect(gate.snapshot()).toEqual({ running: 0, queued: 0 });
	});

	test("a load that fails frees its slot and the failure reaches only its caller", async () => {
		const gate = createSubjectLoadGate({ config: { limit: 1 } });
		const failing = createHeldLoad({ value: "never" });
		const next = createHeldLoad({ value: "next" });
		const failed = gate.run(failing.load);
		const queued = gate.run(next.load);
		await settle();

		failing.fail(new Error("connection lost"));
		await expect(failed).rejects.toThrow("connection lost");
		await settle();
		expect(next.started()).toBe(true);
		next.release();
		expect(await queued).toBe("next");
	});

	test("says how long each load waited for its slot", async () => {
		let now = 1_000;
		const waits: number[] = [];
		const gate = createSubjectLoadGate({
			config: { limit: 1 },
			ctx: {
				now: () => now,
				onAdmit: ({ waitMs }) => waits.push(waitMs),
			},
		});
		const first = createHeldLoad({ value: 1 });
		const second = createHeldLoad({ value: 2 });
		const results = [gate.run(first.load), gate.run(second.load)];
		await settle();
		now = 1_250;
		first.release();
		await settle();
		second.release();
		await Promise.all(results);

		expect(waits).toEqual([0, 250]);
	});
});
