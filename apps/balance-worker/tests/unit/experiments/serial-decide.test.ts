import { afterEach, describe, expect, test } from "bun:test";
import { bindStagingVariants } from "@autumn/edge-config";
import {
	createSerialDecideMode,
	forcedSerialDecideArmFromEnv,
	SERIAL_DECIDE_EXPERIMENT,
} from "../../../src/experiments/serialDecide.js";

const config = (arms: string[]) => ({
	experiments: { [SERIAL_DECIDE_EXPERIMENT]: { arms } },
	updatedAt: new Date().toISOString(),
});

afterEach(() => {
	bindStagingVariants({
		read: () => config([]),
		identity: "none",
		bucket: "autumn-prod-server",
	});
	delete process.env.BALANCE_WORKER_SERIAL_DECIDE_ARM;
});

describe("serial-decide boot arm", () => {
	test("is read once and kept even when the window's arm would change", () => {
		let now = 0;
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-staging",
			now: () => now,
		});
		const mode = createSerialDecideMode();
		const first = mode.read();
		// Walk the clock through many windows: the per-window hash moves, the booted arm does not.
		for (let window = 1; window < 50; window++) {
			now = window * 10_000;
			expect(mode.read()).toEqual(first);
		}
		expect(["A", "B"]).toContain(first.arm);
		expect(first.ioWorkersEnabled).toBe(first.arm !== "A");
		expect(mode.bootArms()).toEqual({ [SERIAL_DECIDE_EXPERIMENT]: first.arm });
	});

	test("reports no boot arm before the layout is chosen", () => {
		expect(createSerialDecideMode().bootArms()).toBeNull();
	});

	test("outside the staging bucket the arm is A whatever the config says", () => {
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-prod-server",
		});
		const mode = createSerialDecideMode().read();
		expect(mode).toEqual({ arm: "A", ioWorkersEnabled: false });
	});

	test("a forced arm wins over the config, and C or D run the I/O worker layout too", () => {
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-staging",
		});
		expect(createSerialDecideMode({ force: "A" }).read()).toEqual({
			arm: "A",
			ioWorkersEnabled: false,
		});
		expect(createSerialDecideMode({ force: "C" }).read()).toEqual({
			arm: "C",
			ioWorkersEnabled: true,
		});
	});

	test("the environment override is honoured outside production only", () => {
		process.env.BALANCE_WORKER_SERIAL_DECIDE_ARM = "B";
		expect(forcedSerialDecideArmFromEnv()).toBe("B");
		process.env.BALANCE_WORKER_SERIAL_DECIDE_ARM = "nope";
		expect(forcedSerialDecideArmFromEnv()).toBeUndefined();
		const nodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		process.env.BALANCE_WORKER_SERIAL_DECIDE_ARM = "B";
		try {
			expect(forcedSerialDecideArmFromEnv()).toBeUndefined();
		} finally {
			process.env.NODE_ENV = nodeEnv;
		}
	});

	test("across many task identities a two-arm config splits the fleet", () => {
		const arms = new Set<string>();
		for (let task = 0; task < 40; task++) {
			bindStagingVariants({
				read: () => config(["A", "B"]),
				identity: `10.0.0.${task}:8082`,
				bucket: "autumn-staging",
			});
			arms.add(createSerialDecideMode().read().arm);
		}
		expect([...arms].sort()).toEqual(["A", "B"]);
	});
});
