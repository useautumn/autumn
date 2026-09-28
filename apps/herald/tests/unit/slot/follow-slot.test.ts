import { expect, test } from "bun:test";
import type { SlotGateDescription } from "@autumn/blue-green";
import { createSlotFollower } from "../../../src/slot/followSlot.js";

/** A gate whose answer the test flips by hand, notifying subscribers the way the store would. */
const createFakeGate = ({ active }: { active: boolean }) => {
	let description: SlotGateDescription = active
		? { active: true, reason: "active" }
		: { active: false, reason: "idle", expectedServiceArn: "arn:other" };
	const listeners = new Set<(gate: SlotGateDescription) => void>();
	return {
		gate: {
			describe: () => description,
			subscribe: (listener: (gate: SlotGateDescription) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		flip: ({ active: next }: { active: boolean }) => {
			description = next
				? { active: true, reason: "active" }
				: { active: false, reason: "idle", expectedServiceArn: "arn:other" };
			for (const listener of listeners) listener(description);
		},
		listeners,
	};
};

/** Jobs whose start and stop the test can hold open, recording every call in order. */
const createFakeJobs = () => {
	const calls: string[] = [];
	let release: (() => void) | null = null;
	const jobs = {
		start: async () => {
			calls.push("start");
			if (release) await new Promise<void>((resolve) => (release = resolve));
		},
		stop: async () => {
			calls.push("stop");
			if (release) await new Promise<void>((resolve) => (release = resolve));
		},
	};
	return {
		jobs,
		calls,
		holdNext: () => {
			release = () => {};
		},
		releaseHeld: () => {
			const pending = release;
			release = null;
			pending?.();
		},
	};
};

const logger = { info: () => {}, error: () => {} };

test("an active slot starts the jobs; an idle one does not", async () => {
	for (const active of [true, false]) {
		const { gate } = createFakeGate({ active });
		const { jobs, calls } = createFakeJobs();
		const follower = createSlotFollower({ ctx: { gate, jobs, logger } });
		await follower.start();
		expect(calls).toEqual(active ? ["start"] : []);
		expect(follower.readState()).toBe(active ? "active" : "idle");
	}
});

test("flips are followed in order: active → idle → active is start, stop, start", async () => {
	const { gate, flip } = createFakeGate({ active: true });
	const { jobs, calls } = createFakeJobs();
	const follower = createSlotFollower({ ctx: { gate, jobs, logger } });
	await follower.start();
	flip({ active: false });
	await Bun.sleep(1);
	flip({ active: true });
	await Bun.sleep(1);
	expect(calls).toEqual(["start", "stop", "start"]);
	expect(follower.readState()).toBe("active");
});

test("a flip during a transition waits for it, and only the last wanted state is applied", async () => {
	const { gate, flip } = createFakeGate({ active: false });
	const fake = createFakeJobs();
	const follower = createSlotFollower({
		ctx: { gate, jobs: fake.jobs, logger },
	});
	await follower.start();

	fake.holdNext();
	flip({ active: true });
	await Bun.sleep(1);
	expect(fake.calls).toEqual(["start"]);
	// Two flips while the start is still running: back to idle, then active again.
	flip({ active: false });
	flip({ active: true });
	await Bun.sleep(1);
	expect(fake.calls).toEqual(["start"]);

	fake.releaseHeld();
	await Bun.sleep(5);
	// The start finished, the wanted state is active, so nothing else runs.
	expect(fake.calls).toEqual(["start"]);
	expect(follower.readState()).toBe("active");
});

test("a flip to idle during a start is applied once the start finishes", async () => {
	const { gate, flip } = createFakeGate({ active: false });
	const fake = createFakeJobs();
	const follower = createSlotFollower({
		ctx: { gate, jobs: fake.jobs, logger },
	});
	await follower.start();
	fake.holdNext();
	flip({ active: true });
	await Bun.sleep(1);
	flip({ active: false });
	fake.releaseHeld();
	await Bun.sleep(5);
	expect(fake.calls).toEqual(["start", "stop"]);
	expect(follower.readState()).toBe("idle");
});

test("a start that fails leaves the slot idle and the next flip tries again", async () => {
	const { gate, flip } = createFakeGate({ active: true });
	const errors: string[] = [];
	let failures = 1;
	const calls: string[] = [];
	const jobs = {
		start: async () => {
			calls.push("start");
			if (failures-- > 0) throw new Error("broker unreachable");
		},
		stop: async () => {
			calls.push("stop");
		},
	};
	const follower = createSlotFollower({
		ctx: {
			gate,
			jobs,
			logger: {
				info: () => {},
				error: (payload: unknown) => {
					if (typeof payload === "object" && payload && "type" in payload)
						errors.push(String(payload.type));
				},
			},
		},
	});
	await follower.start();
	expect(follower.readState()).toBe("idle");
	expect(errors).toEqual(["herald_slot_transition_failed"]);
	flip({ active: false });
	flip({ active: true });
	await Bun.sleep(5);
	expect(calls).toEqual(["start", "start"]);
	expect(follower.readState()).toBe("active");
});

test("stop leaves the groups, stops following, and a later flip does nothing", async () => {
	const { gate, flip, listeners } = createFakeGate({ active: true });
	const { jobs, calls } = createFakeJobs();
	const follower = createSlotFollower({ ctx: { gate, jobs, logger } });
	await follower.start();
	await follower.stop();
	expect(calls).toEqual(["start", "stop"]);
	expect(listeners.size).toBe(0);
	flip({ active: true });
	await Bun.sleep(1);
	expect(calls).toEqual(["start", "stop"]);
	expect(follower.readState()).toBe("idle");
});
