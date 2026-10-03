import { describe, expect, test } from "bun:test";
import { createStandbyPreparations } from "../../../src/blueGreen/createStandbyPreparations.js";

const pending = Symbol("pending");
const settledValue = async <Value>(promise: Promise<Value>) =>
	await Promise.race([promise, Bun.sleep(5).then(() => pending)]);

const createFixture = ({
	active = false,
	settleMs = 0,
}: {
	active?: boolean;
	settleMs?: number;
} = {}) => {
	const listeners = new Set<() => void>();
	const gate = {
		live: active,
		goLive: () => {
			gate.live = true;
			for (const listener of [...listeners]) listener();
		},
		watchers: () => listeners.size,
	};
	const preparations = createStandbyPreparations({
		ctx: {
			gate: {
				isActive: () => gate.live,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
			},
		},
		config: { concurrency: 1, settleMs },
	});
	const acquire = (signal = new AbortController().signal) =>
		preparations.acquire({ signal });
	return { gate, acquire };
};

describe("standby preparations", () => {
	test("a standby prepares one partition at a time, the next starting when the first finishes", async () => {
		const { acquire } = createFixture();
		const first = await acquire();
		const second = acquire();
		expect(await settledValue(second)).toBe(pending);

		first();
		expect(await settledValue(second)).not.toBe(pending);
	});

	test("a live fleet never waits, however many partitions prepare", async () => {
		const { acquire } = createFixture({ active: true });
		const slots = [acquire(), acquire(), acquire()];
		for (const slot of slots)
			expect(await settledValue(slot)).not.toBe(pending);
	});

	test("a fleet that goes live lets everything still queued through at the next finish", async () => {
		const { gate, acquire } = createFixture();
		const first = await acquire();
		const second = acquire();
		const third = acquire();

		gate.live = true;
		first();
		expect(await settledValue(second)).not.toBe(pending);
		expect(await settledValue(third)).not.toBe(pending);
	});

	test("going live releases everything queued at once, even while the preparation in flight never finishes", async () => {
		const { gate, acquire } = createFixture();
		await acquire();
		const second = acquire();
		const third = acquire();

		gate.goLive();
		expect(await settledValue(second)).not.toBe(pending);
		expect(await settledValue(third)).not.toBe(pending);
	});

	test("the gate is only watched while something is queued", async () => {
		const { gate, acquire } = createFixture();
		const first = await acquire();
		expect(gate.watchers()).toBe(0);
		const second = acquire();
		await Bun.sleep(1);
		expect(gate.watchers()).toBe(1);

		first();
		await second;
		expect(gate.watchers()).toBe(0);

		const leaving = new AbortController();
		const queued = acquire(leaving.signal);
		await Bun.sleep(1);
		expect(gate.watchers()).toBe(1);
		leaving.abort(new Error("retired"));
		await expect(queued).rejects.toThrow("retired");
		expect(gate.watchers()).toBe(0);
	});

	test("a standby waits for its assignment to settle before it may prepare", async () => {
		const { acquire } = createFixture({ settleMs: 40 });
		const turn = acquire();
		await Bun.sleep(15);
		expect(await settledValue(turn)).toBe(pending);

		await Bun.sleep(40);
		expect(await settledValue(turn)).not.toBe(pending);
	});

	test("a partition revoked while its assignment settles never prepares or takes the slot", async () => {
		const { acquire } = createFixture({ settleMs: 40 });
		const leaving = new AbortController();
		const revoked = acquire(leaving.signal);
		leaving.abort(new Error("retired"));
		await expect(revoked).rejects.toThrow("retired");

		await Bun.sleep(50);
		const next = acquire();
		await Bun.sleep(50);
		expect(await settledValue(next)).not.toBe(pending);
	});

	test("going live ends the settle at once, and a live fleet never settles", async () => {
		const standby = createFixture({ settleMs: 60_000 });
		const settling = standby.acquire();
		standby.gate.goLive();
		expect(await settledValue(settling)).not.toBe(pending);

		const live = createFixture({ active: true, settleMs: 60_000 });
		expect(await settledValue(live.acquire())).not.toBe(pending);
	});

	test("a partition that leaves while queued gives up its place and never takes the slot", async () => {
		const { acquire } = createFixture();
		const first = await acquire();
		const leaving = new AbortController();
		const revoked = acquire(leaving.signal);
		const next = acquire();

		leaving.abort(new Error("retired"));
		expect(revoked).rejects.toThrow("retired");
		first();
		expect(await settledValue(next)).not.toBe(pending);
	});

	test("releasing a slot twice frees it once", async () => {
		const { acquire } = createFixture();
		const first = await acquire();
		const second = acquire();
		const third = acquire();

		first();
		first();
		expect(await settledValue(second)).not.toBe(pending);
		expect(await settledValue(third)).toBe(pending);
	});
});
