import { describe, expect, test } from "bun:test";
import { createOwnNetworkMonitor } from "../../../../src/health/ownNetwork/createOwnNetworkMonitor.js";
import type { OwnNetworkThresholds } from "../../../../src/health/ownNetwork/judgeOwnNetwork.js";
import type { OwnNetworkVerdict } from "../../../../src/health/ownNetwork/types/ownNetworkVerdict.js";
import type { TcpCounters } from "../../../../src/logging/eventLoopStalls/tcpCounters.js";

const THRESHOLDS: OwnNetworkThresholds = {
	windowMs: 3_000,
	minRetransmits: 15,
	retransmitRatio: 0.05,
	stallMs: 1_000,
	minStalledPartitions: 2,
};

function countersOf({
	outSegs,
	retransSegs,
}: {
	outSegs: number;
	retransSegs: number;
}): TcpCounters {
	return {
		outSegs,
		retransSegs,
		timeouts: 0,
		lossProbes: 0,
		lostRetransmit: 0,
		synRetrans: 0,
	};
}

function harness({
	lossy,
	stuck,
	held = () => true,
}: {
	lossy: () => boolean;
	stuck: () => boolean;
	held?: (partition: number) => boolean;
}) {
	const time = { now: 0 };
	const totals = { outSegs: 0, retransSegs: 0 };
	const scheduled: { intervalMs: number; run(): void }[] = [];
	const cancelled: number[] = [];
	function readTcp(): TcpCounters {
		return countersOf(totals);
	}
	function take() {
		return stuck()
			? [80, 81, 82].map((partition) => ({
					partition,
					longestInFlightMs: 1_500,
				}))
			: [];
	}
	const monitor = createOwnNetworkMonitor({
		ctx: {
			sends: { take },
			isHeld: ({ partition }) => held(partition),
			readTcp,
			now: () => time.now,
			schedule: (task) => {
				scheduled.push(task);
				return () => cancelled.push(task.intervalMs);
			},
		},
		config: { sampleMs: 1_000, thresholds: THRESHOLDS },
	});
	function tick(): void {
		time.now += 1_000;
		totals.outSegs += 100;
		if (lossy()) totals.retransSegs += 30;
		for (const task of scheduled) task.run();
	}
	return { monitor, scheduled, cancelled, tick };
}

describe("own network monitor", () => {
	test("samples on its interval and reports degraded once a full window is bad", () => {
		const { monitor, scheduled, tick } = harness({
			lossy: () => true,
			stuck: () => true,
		});
		const heard: OwnNetworkVerdict[] = [];
		monitor.onDegraded((verdict) => heard.push(verdict));
		monitor.start();
		expect(scheduled.map((task) => task.intervalMs)).toEqual([1_000]);
		tick();
		tick();
		tick();
		expect(monitor.verdict().state).toBe("insufficient_data");
		expect(heard).toHaveLength(0);
		tick();
		expect(monitor.verdict()).toMatchObject({
			state: "degraded",
			segments: 300,
			retransmitRatio: 0.3,
			stalledPartitions: 3,
		});
		expect(heard).toHaveLength(1);
	});

	test("a healthy window reports nothing, and an unsubscribed listener hears nothing", () => {
		const loss = { on: false };
		const { monitor, tick } = harness({
			lossy: () => loss.on,
			stuck: () => true,
		});
		const heard: OwnNetworkVerdict[] = [];
		const unsubscribe = monitor.onDegraded((verdict) => heard.push(verdict));
		monitor.start();
		for (let index = 0; index < 5; index++) tick();
		expect(monitor.verdict().state).toBe("healthy");
		expect(heard).toHaveLength(0);
		unsubscribe();
		loss.on = true;
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict().state).toBe("degraded");
		expect(heard).toHaveLength(0);
	});

	test("sends on partitions the worker no longer serves do not count", () => {
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => true,
			held: (partition) => partition === 82,
		});
		monitor.start();
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict()).toMatchObject({
			state: "healthy",
			busyPartitions: 1,
			stalledPartitions: 1,
		});
	});

	test("stalls stop counting the moment their partition is no longer held, even inside the window", () => {
		const held = new Set([80, 81, 82]);
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => true,
			held: (partition) => held.has(partition),
		});
		monitor.start();
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict().state).toBe("degraded");
		held.clear();
		expect(monitor.verdict()).toMatchObject({
			state: "healthy",
			busyPartitions: 0,
			stalledPartitions: 0,
		});
	});

	test("a partition held again starts without the stalls of its earlier holding", () => {
		const held = new Set([80, 81, 82]);
		const stuck = { on: true };
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => stuck.on,
			held: (partition) => held.has(partition),
		});
		monitor.start();
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict().state).toBe("degraded");
		held.clear();
		stuck.on = false;
		tick();
		for (const partition of [80, 81, 82]) held.add(partition);
		expect(monitor.verdict()).toMatchObject({
			state: "healthy",
			stalledPartitions: 0,
		});
	});

	test("stop cancels the schedule", () => {
		const { monitor, cancelled } = harness({
			lossy: () => false,
			stuck: () => false,
		});
		monitor.start();
		monitor.stop();
		expect(cancelled).toEqual([1_000]);
	});
});
