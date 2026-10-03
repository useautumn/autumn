import { expect, test } from "bun:test";
import {
	registerProcessSignals,
	startHerald,
	stopHerald,
} from "../../../src/lifecycle/heraldLifecycle.js";
import type {
	HeraldLifecycleContext,
	HeraldLifecycleState,
} from "../../../src/lifecycle/types/heraldLifecycle.js";

const createLifecycle = ({
	start = async () => {},
	stop = async () => {},
	stopBudgetMs = 1_000,
}: {
	start?: () => Promise<void>;
	stop?: () => Promise<void>;
	stopBudgetMs?: number;
} = {}) => {
	const exits: number[] = [];
	const events: string[] = [];
	const errorLogs: unknown[][] = [];
	const ctx: HeraldLifecycleContext = {
		herald: { start, stop },
		logger: {
			info: () => {},
			error: (payload: unknown, message: unknown) => {
				errorLogs.push([payload, message]);
				const type =
					typeof payload === "object" && payload && "type" in payload
						? String(payload.type)
						: "error";
				events.push(type);
			},
			flush: async () => {
				events.push("flush");
			},
		} as HeraldLifecycleContext["logger"],
		exit: (code) => {
			exits.push(code);
		},
		stopBudgetMs,
	};
	const state: HeraldLifecycleState = { stopping: null };
	return { ctx, state, exits, events, errorLogs };
};

test("a signal with a clean stop exits 0 after flushing the logs", async () => {
	const { ctx, state, exits, events } = createLifecycle();
	await stopHerald({ ctx, state, reason: "signal" });
	expect(exits).toEqual([0]);
	expect(events).toEqual(["flush"]);
});

test("a stop that throws exits 1 and says so", async () => {
	const { ctx, state, exits, events } = createLifecycle({
		stop: async () => {
			throw new Error("store would not close");
		},
	});
	await stopHerald({ ctx, state, reason: "signal" });
	expect(exits).toEqual([1]);
	expect(events).toEqual(["herald_stop_failed", "flush"]);
});

test("a consumer crash exits 1 even when the stop itself is clean", async () => {
	const { ctx, state, exits } = createLifecycle();
	await stopHerald({ ctx, state, reason: "consumer_crashed" });
	expect(exits).toEqual([1]);
});

test("a failed start still stops, so stores close, and exits 1", async () => {
	const stops: string[] = [];
	const { ctx, state, exits, events } = createLifecycle({
		start: async () => {
			throw new Error("topic missing");
		},
		stop: async () => {
			stops.push("stop");
		},
	});
	await startHerald({ ctx, state });
	expect(stops).toEqual(["stop"]);
	expect(exits).toEqual([1]);
	expect(events).toEqual(["herald_start_failed", "flush"]);
});

test("a second stop, whatever its reason, joins the first: one stop, one exit", async () => {
	let release = () => {};
	const stops: string[] = [];
	const { ctx, state, exits } = createLifecycle({
		stop: () =>
			new Promise<void>((resolve) => {
				stops.push("stop");
				release = resolve;
			}),
	});
	const first = stopHerald({ ctx, state, reason: "signal" });
	const second = stopHerald({ ctx, state, reason: "consumer_crashed" });
	release();
	await Promise.all([first, second]);
	expect(stops).toEqual(["stop"]);
	expect(exits).toEqual([0]);
});

test("a stop that hangs past its budget is forced out with exit 1", async () => {
	const { ctx, state, exits, events, errorLogs } = createLifecycle({
		stop: () => new Promise<void>(() => {}),
		stopBudgetMs: 20,
	});
	void stopHerald({ ctx, state, reason: "signal" });
	await new Promise((resolve) => setTimeout(resolve, 60));
	expect(exits).toEqual([1]);
	expect(events).toEqual(["herald_stop_forced", "flush"]);
	expect(errorLogs).toEqual([
		[
			{
				type: "herald_stop_forced",
				error_type: "herald_stop_forced",
				data: { stopBudgetMs: 20 },
			},
			"Herald stop exceeded its budget; exiting anyway",
		],
	]);
});

test("SIGTERM and SIGINT both stop herald as a signal", async () => {
	const { ctx, state, exits } = createLifecycle();
	const handlers = new Map<string, () => void>();
	registerProcessSignals({
		ctx,
		state,
		process: {
			once: ((event: string, handler: () => void) => {
				handlers.set(event, handler);
			}) as NodeJS.Process["once"],
		},
	});
	expect([...handlers.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
	handlers.get("SIGTERM")?.();
	await state.stopping;
	expect(exits).toEqual([0]);
});
