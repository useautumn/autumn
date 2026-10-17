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
	holdingOf = () => 1,
	sendHolding = holdingOf,
	heldCount = () => 3,
}: {
	lossy: () => boolean;
	stuck: () => boolean;
	holdingOf?: (partition: number) => number | undefined;
	sendHolding?: (partition: number) => number | undefined;
	heldCount?: () => number;
}) {
	const time = { now: 0 };
	const totals = { outSegs: 0, retransSegs: 0 };
	const scheduled: { intervalMs: number; run(): void }[] = [];
	const cancelled: number[] = [];
	function readTcp(): TcpCounters {
		return countersOf(totals);
	}
	function take({
		isCurrent,
	}: {
		now: number;
		isCurrent(holding: { partition: number; holding: number }): boolean;
	}) {
		if (!stuck()) return [];
		const sends: {
			partition: number;
			holding: number;
			longestInFlightMs: number;
		}[] = [];
		for (const partition of [80, 81, 82]) {
			const holding = sendHolding(partition);
			if (holding === undefined || !isCurrent({ partition, holding })) continue;
			sends.push({ partition, holding, longestInFlightMs: 1_500 });
		}
		return sends;
	}
	const monitor = createOwnNetworkMonitor({
		ctx: {
			sends: { take },
			holdingOf: ({ partition }) => holdingOf(partition),
			heldCount,
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

	test("sends on partitions the worker no longer holds do not count", () => {
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => true,
			holdingOf: (partition) => (partition === 82 ? 1 : undefined),
			heldCount: () => 1,
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
			holdingOf: (partition) => (held.has(partition) ? 1 : undefined),
			heldCount: () => held.size,
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

	test("a partition let go and taken again between two samples starts without its earlier stalls", () => {
		const holding = { current: 1 };
		const stuck = { on: true };
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => stuck.on,
			holdingOf: () => holding.current,
		});
		monitor.start();
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict().state).toBe("degraded");
		holding.current = 2;
		stuck.on = false;
		expect(monitor.verdict()).toMatchObject({
			state: "healthy",
			stalledPartitions: 0,
		});
	});

	test("stalls count against every partition the worker holds, not only the busy ones", () => {
		const { monitor, tick } = harness({
			lossy: () => true,
			stuck: () => true,
			heldCount: () => 8,
		});
		monitor.start();
		for (let index = 0; index < 4; index++) tick();
		expect(monitor.verdict()).toMatchObject({
			state: "healthy",
			stalledPartitions: 3,
			heldPartitions: 8,
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
