/**
 * When the world's LISTEN connection dies eve exits with LISTENER_LOST_EXIT_CODE
 * and leaf restarts it with backoff; past the cap eve stays up on its local world.
 */

import { describe, expect, mock, test } from "bun:test";
import { LISTENER_LOST_EXIT_CODE } from "../../../agent/lib/workflowWorld/listenerLostExitCode.js";
import { embeddedEveStatus } from "../../../src/internal/agentRuntime/eve/embeddedStatus.js";
import { createRestartBudget } from "../../../src/internal/agentRuntime/eve/restartBudget.js";
import { superviseEve } from "../../../src/internal/agentRuntime/eve/superviseEve.js";

const budgetAt = (clock: { now: number }) =>
	createRestartBudget({
		maxRestarts: 3,
		windowMs: 60_000,
		baseDelayMs: 1000,
		maxDelayMs: 3000,
		now: () => clock.now,
	});

describe("restart budget", () => {
	test("backs off exponentially up to the max delay, then stops at the cap", () => {
		const budget = budgetAt({ now: 0 });
		expect(budget.nextDelayMs()).toBe(1000);
		expect(budget.nextDelayMs()).toBe(2000);
		expect(budget.nextDelayMs()).toBe(3000);
		expect(budget.nextDelayMs()).toBeUndefined();
		expect(budget.nextDelayMs()).toBeUndefined();
	});

	test("restarts older than the window stop counting", () => {
		const clock = { now: 0 };
		const budget = budgetAt(clock);
		budget.nextDelayMs();
		budget.nextDelayMs();
		budget.nextDelayMs();
		clock.now = 59_999;
		expect(budget.nextDelayMs()).toBeUndefined();
		clock.now = 60_000;
		expect(budget.nextDelayMs()).toBe(1000);
	});

	test("a quiet window resets the backoff", () => {
		const clock = { now: 0 };
		const budget = budgetAt(clock);
		budget.nextDelayMs();
		budget.nextDelayMs();
		clock.now = 120_000;
		expect(budget.nextDelayMs()).toBe(1000);
	});
});

/** Each start returns the next scripted exit code. */
const scriptedEve = (codes: number[]) => {
	const starts: { allowDurable: boolean }[] = [];
	const start = mock(async (params: { allowDurable: boolean }) => {
		starts.push(params);
		const code = codes.shift();
		if (code === undefined)
			throw new Error("eve started more often than scripted");
		return { exited: Promise.resolve(code) };
	});
	return { start, starts };
};

describe("eve supervisor", () => {
	test("a lost listener restarts eve after each backoff delay", async () => {
		const eve = scriptedEve([
			LISTENER_LOST_EXIT_CODE,
			LISTENER_LOST_EXIT_CODE,
			1,
		]);
		const sleeps: number[] = [];
		const exitLeaf = mock(() => undefined);
		await superviseEve({
			start: eve.start,
			budget: budgetAt({ now: 0 }),
			exitLeaf,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		expect(eve.starts).toEqual([
			{ allowDurable: true },
			{ allowDurable: true },
			{ allowDurable: true },
		]);
		expect(sleeps).toEqual([1000, 2000]);
		expect(exitLeaf).toHaveBeenCalledWith(1);
	});

	test("past the cap eve restarts once on its local world and stays up", async () => {
		const eve = scriptedEve([
			LISTENER_LOST_EXIT_CODE,
			LISTENER_LOST_EXIT_CODE,
			LISTENER_LOST_EXIT_CODE,
			LISTENER_LOST_EXIT_CODE,
			0,
		]);
		const sleeps: number[] = [];
		const exitLeaf = mock(() => undefined);
		await superviseEve({
			start: eve.start,
			budget: budgetAt({ now: 0 }),
			exitLeaf,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		expect(eve.starts.map((s) => s.allowDurable)).toEqual([
			true,
			true,
			true,
			true,
			false,
		]);
		expect(sleeps).toEqual([1000, 2000, 3000]);
		expect(exitLeaf).toHaveBeenCalledWith(0);
	});

	test("any other eve exit ends leaf without a restart, as before", async () => {
		const eve = scriptedEve([137]);
		const exitLeaf = mock(() => undefined);
		await superviseEve({
			start: eve.start,
			budget: budgetAt({ now: 0 }),
			exitLeaf,
			sleep: async () => undefined,
		});
		expect(eve.start).toHaveBeenCalledTimes(1);
		expect(exitLeaf).toHaveBeenCalledWith(137);
		expect(embeddedEveStatus()).toBe("down");
	});
});
