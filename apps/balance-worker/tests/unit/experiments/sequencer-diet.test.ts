import { afterEach, describe, expect, test } from "bun:test";
import { bindStagingVariants } from "@autumn/edge-config";
import {
	createSequencerDietMode,
	forcedSequencerDietArmFromEnv,
	SEQUENCER_DIET_EXPERIMENT,
} from "../../../src/experiments/sequencerDiet.js";
import {
	createSerialDecideMode,
	SERIAL_DECIDE_EXPERIMENT,
} from "../../../src/experiments/serialDecide.js";

const config = (arms: Record<string, string[]>) => ({
	experiments: Object.fromEntries(
		Object.entries(arms).map(([name, list]) => [
			name,
			{ arms: list, scope: "task" as const },
		]),
	),
	updatedAt: new Date().toISOString(),
});

afterEach(() => {
	bindStagingVariants({
		read: () => config({}),
		identity: "none",
		bucket: "autumn-prod-server",
	});
	delete process.env.BALANCE_WORKER_SEQUENCER_DIET_ARM;
});

describe("sequencer-diet", () => {
	test("is inert under serial-decide A and B whatever its own arm says", () => {
		for (const layout of ["A", "B"] as const) {
			const serialDecide = createSerialDecideMode({ force: layout });
			const diet = createSequencerDietMode({
				serialDecide: serialDecide.read,
				force: "B",
			});
			expect(diet.read()).toEqual({
				arm: "B",
				active: false,
				hashedDedup: false,
				batchedForget: false,
			});
			expect(diet.bootArms()).toBeNull();
		}
	});

	test("under serial-decide C and D, B turns on the hashed window and the batched forget; A changes nothing", () => {
		for (const layout of ["C", "D"] as const) {
			const serialDecide = createSerialDecideMode({ force: layout });
			const on = createSequencerDietMode({
				serialDecide: serialDecide.read,
				force: "B",
			});
			expect(on.read()).toEqual({
				arm: "B",
				active: true,
				hashedDedup: true,
				batchedForget: true,
			});
			expect(on.bootArms()).toEqual({ [SEQUENCER_DIET_EXPERIMENT]: "B" });
			const off = createSequencerDietMode({
				serialDecide: serialDecide.read,
				force: "A",
			});
			expect(off.read().active).toBe(false);
			expect(off.bootArms()).toBeNull();
		}
	});

	test("the arm is read once from the staging variants and kept for the task's life", () => {
		let now = 0;
		bindStagingVariants({
			read: () =>
				config({
					[SERIAL_DECIDE_EXPERIMENT]: ["A", "C"],
					[SEQUENCER_DIET_EXPERIMENT]: ["A", "B"],
				}),
			identity: "task-7",
			bucket: "autumn-staging",
			now: () => now,
		});
		const serialDecide = createSerialDecideMode();
		const diet = createSequencerDietMode({ serialDecide: serialDecide.read });
		const first = diet.read();
		for (let window = 1; window < 30; window++) {
			now = window * 10_000;
			expect(diet.read()).toEqual(first);
		}
		expect(first.active).toBe(
			first.arm === "B" && serialDecide.read().arm === "C",
		);
	});

	test("outside the staging bucket the diet is A, and the environment only forces it outside production", () => {
		const serialDecide = createSerialDecideMode({ force: "C" });
		expect(
			createSequencerDietMode({ serialDecide: serialDecide.read }).read().arm,
		).toBe("A");
		process.env.BALANCE_WORKER_SEQUENCER_DIET_ARM = "B";
		expect(forcedSequencerDietArmFromEnv()).toBe("B");
		process.env.BALANCE_WORKER_SEQUENCER_DIET_ARM = "C";
		expect(forcedSequencerDietArmFromEnv()).toBeUndefined();
	});
});
