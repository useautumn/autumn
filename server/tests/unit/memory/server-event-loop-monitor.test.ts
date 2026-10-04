import { describe, expect, test } from "bun:test";
import {
	bindStagingVariants,
	defaultStagingVariantsConfig,
} from "@autumn/edge-config";
import {
	drainFinishedRequestCount,
	registerInFlightRequest,
} from "@/utils/memory/inFlightRequests.js";
import {
	startServerEventLoopMonitor,
	summarizeServerEventLoopWindow,
} from "@/utils/memory/serverEventLoopMonitor.js";

describe("summarizeServerEventLoopWindow", () => {
	test("turns cpuUsage deltas, requests and lag ns into the window line", () => {
		const data = summarizeServerEventLoopWindow({
			pid: 42,
			cpuModel: "Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz",
			windowMs: 10_000.4567,
			previousCpu: { user: 1_000_000, system: 500_000 },
			currentCpu: { user: 4_250_500, system: 1_250_250 },
			requests: 1_234,
			lagP99Ns: 12_345_678,
			lagMaxNs: 98_765_432,
		});

		expect(data).toEqual({
			pid: 42,
			cpuModel: "Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz",
			windowMs: 10_000.46,
			cpuMs: 4_000.75,
			cpuUserMs: 3_250.5,
			cpuSystemMs: 750.25,
			cpuPct: 40.01,
			cpuCoreEquivalents: 0.400057,
			requests: 1_234,
			eventLoopLagP99Ms: 12.35,
			eventLoopLagMaxMs: 98.77,
		});
	});

	test("reports 0 cpuPct for an empty window", () => {
		const cpu = { user: 5, system: 5 };
		const data = summarizeServerEventLoopWindow({
			pid: 1,
			cpuModel: undefined,
			windowMs: 0,
			previousCpu: cpu,
			currentCpu: cpu,
			requests: 0,
			lagP99Ns: 0,
			lagMaxNs: 0,
		});

		expect(data.cpuMs).toBe(0);
		expect(data.cpuPct).toBe(0);
	});
});

describe("startServerEventLoopMonitor gate", () => {
	test.each([
		"autumn-prod-server",
		"autumn-dev-server",
		"autumn-staging-server",
	])("does not start on %s", (bucket) => {
		expect(startServerEventLoopMonitor({ bucket }).started).toBe(false);
	});

	test("starts on the staging edge-config bucket once staging variants are bound, and not before", () => {
		bindStagingVariants({
			read: defaultStagingVariantsConfig,
			identity: "task",
			bucket: "autumn-prod-server",
		});
		expect(
			startServerEventLoopMonitor({ bucket: "autumn-staging" }).started,
		).toBe(false);
		bindStagingVariants({
			read: defaultStagingVariantsConfig,
			identity: "task",
			bucket: "autumn-staging",
		});
		const monitor = startServerEventLoopMonitor({ bucket: "autumn-staging" });
		monitor.stop();
		expect(monitor.started).toBe(true);
		bindStagingVariants({
			read: defaultStagingVariantsConfig,
			identity: "task",
			bucket: "autumn-prod-server",
		});
	});
});

test("finished requests are counted once and drained per window", () => {
	drainFinishedRequestCount();
	for (let index = 0; index < 3; index++) {
		registerInFlightRequest({
			startedAt: 0,
			method: "POST",
			path: "/v1/track",
			resolveIdentity: () => ({}),
		})();
	}

	expect(drainFinishedRequestCount()).toBe(3);
	expect(drainFinishedRequestCount()).toBe(0);
});
