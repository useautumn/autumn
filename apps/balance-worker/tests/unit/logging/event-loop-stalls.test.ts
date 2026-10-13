import { expect, test } from "bun:test";
import type { CpuCounters } from "../../../src/logging/eventLoopStalls/cpuCounters.js";
import { createEventLoopStallMonitor } from "../../../src/logging/eventLoopStalls/createEventLoopStallMonitor.js";
import { createSyncSectionRecorder } from "../../../src/logging/eventLoopStalls/syncSections.js";
import type { TcpCounters } from "../../../src/logging/eventLoopStalls/tcpCounters.js";

type Log = unknown[];

const idleCpu: CpuCounters = {
	processMicros: 0,
	host: null,
	throttledMicros: null,
	mainThreadMicros: null,
};

function createFixture({
	reportEveryMs = 1_000,
	cpu = () => idleCpu,
	tcp = () => null,
	signals,
}: {
	reportEveryMs?: number;
	cpu?: () => CpuCounters;
	tcp?: () => TcpCounters | null;
	signals?: () => Record<string, unknown>;
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
			cpu,
			tcp,
			signals,
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
			cpuModel: "Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz",
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

function summaryOf({ infos }: { infos: Log[] }) {
	return infos.find(
		([fields]) =>
			(fields as { event?: string }).event === "balance_worker.event_loop",
	)?.[0];
}

test("the periodic summary says how much CPU the worker and its decide thread got, and what the host took or waited on", () => {
	const samples: CpuCounters[] = [
		{
			processMicros: 1_000_000,
			host: { stealTicks: 100, iowaitTicks: 50, totalTicks: 1_000 },
			throttledMicros: 2_000,
			mainThreadMicros: 500_000,
		},
		{
			processMicros: 1_250_000,
			host: { stealTicks: 160, iowaitTicks: 60, totalTicks: 1_100 },
			throttledMicros: 7_000,
			mainThreadMicros: 650_000,
		},
	];
	const { monitor, infos, elapse } = createFixture({
		cpu: () => samples.shift() ?? idleCpu,
	});
	monitor.start();
	elapse({ elapsedMs: 1_000 });

	expect(summaryOf({ infos })).toMatchObject({
		data: {
			windowMs: 1_000,
			cpuModel: "Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz",
			cpuMs: 250,
			cpuPct: 25,
			stealPct: 60,
			iowaitPct: 10,
			throttledMs: 5,
			mainCpuPct: 15,
		},
	});
});

test("without host or cgroup counters the summary still reports the worker's own CPU, and omits the rest", () => {
	const samples: CpuCounters[] = [
		{
			processMicros: 0,
			host: null,
			throttledMicros: null,
			mainThreadMicros: null,
		},
		{
			processMicros: 400_000,
			host: null,
			throttledMicros: null,
			mainThreadMicros: null,
		},
	];
	const { monitor, infos, elapse } = createFixture({
		cpu: () => samples.shift() ?? idleCpu,
	});
	monitor.start();
	elapse({ elapsedMs: 1_000 });

	const summary = summaryOf({ infos }) as { data: Record<string, unknown> };
	expect(summary.data).toMatchObject({ cpuMs: 400, cpuPct: 40 });
	expect(summary.data).not.toHaveProperty("stealPct");
	expect(summary.data).not.toHaveProperty("iowaitPct");
	expect(summary.data).not.toHaveProperty("throttledMs");
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

test("each summary carries the window's signals, drained once per report", () => {
	let window = 0;
	const { monitor, infos, elapse } = createFixture({
		signals: () => ({ inline: { track: ++window } }),
	});
	monitor.start();
	elapse({ elapsedMs: 1_000 });
	expect(summaryOf({ infos })).toMatchObject({
		data: { inline: { track: 1 } },
	});
	expect(window).toBe(1);
});

test("each summary carries the window's TCP loss counters, and omits them without /proc/net", () => {
	const quiet: TcpCounters = {
		timeouts: 9,
		retransSegs: 5,
		lossProbes: 15,
		lostRetransmit: 2,
		synRetrans: 3,
		outSegs: 9_388,
	};
	const samples: TcpCounters[] = [
		quiet,
		{ ...quiet, timeouts: 12, retransSegs: 8, lossProbes: 16, outSegs: 19_388 },
	];
	const { monitor, infos, elapse } = createFixture({
		tcp: () => samples.shift() ?? null,
	});
	monitor.start();
	elapse({ elapsedMs: 1_000 });
	expect(summaryOf({ infos })).toMatchObject({
		data: {
			tcp: {
				timeouts: 3,
				retransSegs: 3,
				lossProbes: 1,
				lostRetransmit: 0,
				synRetrans: 0,
				outSegs: 10_000,
			},
		},
	});

	const unread = createFixture();
	unread.monitor.start();
	unread.elapse({ elapsedMs: 1_000 });
	expect(
		(summaryOf({ infos: unread.infos }) as { data: object }).data,
	).not.toHaveProperty("tcp");
});
