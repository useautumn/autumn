import { expect, test } from "bun:test";
import { createEventLoopStallMonitor } from "../../../src/logging/eventLoopStalls/createEventLoopStallMonitor.js";
import { createSyncSectionRecorder } from "../../../src/logging/eventLoopStalls/syncSections.js";

type Log = unknown[];

function createFixture({
	reportEveryMs = 1_000,
}: {
	reportEveryMs?: number;
} = {}) {
	let clock = 1_000;
	const now = () => clock;
	const infos: Log[] = [];
	const warns: Log[] = [];
	let tick: (() => void) | undefined;
	let cancelled = false;
	const recorder = createSyncSectionRecorder({ now });
	const monitor = createEventLoopStallMonitor({
		ctx: {
			logger: {
				info: (...args: unknown[]) => {
					infos.push(args);
				},
				warn: (...args: unknown[]) => {
					warns.push(args);
				},
			},
			recorder,
			now,
			schedule: ({ run }) => {
				tick = run;
				return () => {
					cancelled = true;
				};
			},
		},
		config: {
			deployment: "tf-balance-staging-v2-64",
			endpoint: "http://10.192.11.9:8082",
			intervalMs: 10,
			stallThresholdMs: 20,
			logStallMs: 50,
			reportEveryMs,
		},
	});
	/** Advance the clock by `elapsedMs`, doing `work` in that time, then fire the timer. */
	function elapse({
		elapsedMs,
		work,
	}: {
		elapsedMs: number;
		work?: () => void;
	}): void {
		const target = clock + elapsedMs;
		work?.();
		clock = Math.max(clock, target);
		tick?.();
	}
	function block({ label, ms }: { label: string; ms: number }): void {
		recorder.time({ label }, () => {
			clock += ms;
		});
	}
	return {
		monitor,
		recorder,
		infos,
		warns,
		elapse,
		block,
		isCancelled: () => cancelled,
	};
}

test("a timer firing on time is not a stall", () => {
	const { monitor, warns, elapse } = createFixture();
	monitor.start();
	for (let i = 0; i < 10; i++) elapse({ elapsedMs: 12 });
	expect(warns).toHaveLength(0);
});

test("a long synchronous section is logged as a stall, named", () => {
	const { monitor, warns, elapse, block } = createFixture();
	monitor.start();
	elapse({ elapsedMs: 10 });
	elapse({
		elapsedMs: 10,
		work: () => {
			block({ label: "applyBillingPlan.decide", ms: 70 });
			block({ label: "check.compute", ms: 3 });
		},
	});
	expect(warns).toHaveLength(1);
	expect(warns[0][0]).toMatchObject({
		event: "balance_worker.event_loop_stall",
		workerDeployment: "tf-balance-staging-v2-64",
		data: {
			workerEndpoint: "http://10.192.11.9:8082",
			lagMs: 63,
			sections: [
				{ label: "applyBillingPlan.decide", durationMs: 70 },
				{ label: "check.compute", durationMs: 3 },
			],
		},
	});
});

test("a stall with nothing timed is reported as unattributed", () => {
	const { monitor, warns, elapse } = createFixture();
	monitor.start();
	elapse({ elapsedMs: 10 });
	elapse({ elapsedMs: 90 });
	expect(warns[0][0]).toMatchObject({
		data: { lagMs: 80, sections: [], attributedMs: 0 },
	});
});

test("the periodic summary counts stalls and sums time per section, then resets", () => {
	const { monitor, infos, elapse, block } = createFixture();
	monitor.start();
	elapse({ elapsedMs: 10 });
	elapse({
		elapsedMs: 10,
		work: () => block({ label: "track.decide", ms: 30 }),
	});
	elapse({
		elapsedMs: 10,
		work: () => block({ label: "track.decide", ms: 4 }),
	});
	elapse({ elapsedMs: 1_000 });

	const summary = infos.find(
		([fields]) =>
			(fields as { event?: string }).event === "balance_worker.event_loop",
	);
	expect(summary?.[0]).toMatchObject({
		data: {
			stalls: 2,
			maxLagMs: 990,
			sections: { "track.decide": { count: 2, totalMs: 34, maxMs: 30 } },
		},
	});

	infos.length = 0;
	for (let i = 0; i < 101; i++) elapse({ elapsedMs: 10 });
	const next = infos.find(
		([fields]) =>
			(fields as { event?: string }).event === "balance_worker.event_loop",
	);
	expect(next?.[0]).toMatchObject({
		data: { stalls: 0, stalledMs: 0, sections: {} },
	});
});

test("per-stall logs are capped within one report window", () => {
	const { monitor, warns, elapse } = createFixture({ reportEveryMs: 60_000 });
	monitor.start();
	elapse({ elapsedMs: 10 });
	for (let i = 0; i < 40; i++) elapse({ elapsedMs: 70 });
	expect(warns).toHaveLength(20);
});

test("stop cancels the timer", () => {
	const { monitor, isCancelled } = createFixture();
	monitor.start();
	monitor.stop();
	expect(isCancelled()).toBe(true);
});

test("a timed section returns its value and still records when it throws", () => {
	const { recorder } = createFixture();
	expect(recorder.time({ label: "subject.read" }, () => 7)).toBe(7);
	expect(() =>
		recorder.time({ label: "subject.read" }, () => {
			throw new Error("boom");
		}),
	).toThrow("boom");
	expect(recorder.drainTotals()["subject.read"]?.count).toBe(2);
});
