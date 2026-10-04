import { expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createProcessStats,
	type ProcessStatsWindow,
} from "../../../src/logging/processStats/createProcessStats.js";
import {
	createGcLogTotals,
	type GcTotals,
	isGcLogLine,
} from "../../../src/logging/processStats/gcLogTotals.js";
import {
	createHealthReporterFixture,
	partitionHealth,
} from "./health-reporter-fixture.js";

const burn = (ms: number) => {
	const end = performance.now() + ms;
	let sink = 0;
	while (performance.now() < end) sink += Math.random();
	return sink;
};

test("a window splits the process's CPU by user, kernel and thread, with GCs and loop delay", async () => {
	const stats = createProcessStats();
	try {
		stats.readWindow();
		await Bun.sleep(30);
		burn(60);
		let garbage: unknown[] = [];
		for (let index = 0; index < 400_000; index++) {
			garbage.push({ index });
			if (garbage.length > 10_000) garbage = [];
		}
		Bun.gc(true);
		await Bun.sleep(30);
		const window = stats.readWindow();
		expect(window.windowMs).toBeGreaterThanOrEqual(100);
		expect(window.userCpuMs + window.sysCpuMs).toBeGreaterThanOrEqual(50);
		expect(window.voluntaryCtxSwitches).toBeGreaterThanOrEqual(0);
		expect(window.involuntaryCtxSwitches).toBeGreaterThanOrEqual(0);
		// The JS thread is named after the binary; its ticks are 10 ms, so it shows the burn.
		expect(window.threads.bun?.userMs).toBeGreaterThanOrEqual(40);
		expect(window.mainOnCpuMs).toBeGreaterThanOrEqual(50);
		expect(window.mainRunQueueMs).toBeGreaterThanOrEqual(0);
		expect(window.syscr).toBeGreaterThanOrEqual(0);
		expect(window.gc).toBeNull();
		// The 60 ms burn held the loop.
		expect(window.eventLoopDelayMs?.max).toBeGreaterThanOrEqual(40);

		const quiet = stats.readWindow();
		expect(quiet.userCpuMs).toBeLessThan(window.userCpuMs);
	} finally {
		stats.stop();
	}
});

test("each health and partition_health line carries the same process window", () => {
	const window = { windowMs: 10_000, userCpuMs: 700 } as ProcessStatsWindow;
	let reads = 0;
	const { reporter, health, logs, timers } = createHealthReporterFixture({
		readProcess: () => {
			reads++;
			return window;
		},
	});
	try {
		reporter.start();
		health.partitions = [partitionHealth(), partitionHealth()];
		timers[0]?.run();
		expect(reads).toBe(2);
		const lines = logs.slice(1).map(([fields]) => fields);
		expect(lines).toHaveLength(3);
		for (const line of lines)
			expect(line).toMatchObject({ data: { process: window } });
	} finally {
		reporter.stop();
	}
});

test("without a process reader the reports are unchanged", () => {
	const { reporter, logs } = createHealthReporterFixture();
	try {
		reporter.start();
		expect(logs[0]?.[0]).not.toHaveProperty("data.process");
	} finally {
		reporter.stop();
	}
});

/** Verbatim `BUN_JSC_logGC=1` output from Bun 1.3.14: one small eden collection, then one in five increments. */
const GC_LOG = [
	"[GC<0x7f8122400108>: starting 0.038210ms]",
	"[GC<0x7f8122400108>: START M 416kb => EdenCollection, a=0kb hf=0.000 mu=0.600 v=0kb (C:0 M:0 P1:0) o=0 b=0 i#1:N<CsMsrShDMsm(0)> 4+0 v=159kb (C:40 M:0 P1:118) o=1 b=0 i#2:N<WsOJw>Pbc 0+0 v=159kb (C:40 M:0 P1:118) o=1 b=0 i#3:P<MsrShCsDMsm(0)CbDomoWsOJw>Pbc => 171kb, p=1.237194ms (max 1.237194), cycle 1.201334ms END]",
	"GC END!",
	"[GC<0x7f8122400108>: finalize 0.018070ms]",
	"Requesting GC because bytes allocated this cycle: 33617230 exceed bytes allowed: 33554432 normal bytes: 26367182 oversized bytes: 7250048 last oversized: 347904",
	"[GC<0x7f8122400108>: START M 33973kb => FullCollection, a=0kb hf=0.000 mu=0.600 v=0kb (C:0 M:0 P1:0) o=1 b=4 i#1:N<CsMsrShDMsm(4)> 10+0 p=1.949697ms (max 1.949697)...]",
	"[GC<0x7f8122400108>: M a=350kb hf=0.027 mu=0.584 v=5169kb (C:5163 M:0 P1:5) o=1 b=0 0+0 p=0.782233ms (max 1.949697)...]",
	"[GC<0x7f8122400108>: M a=4922kb hf=0.375 mu=0.375 v=10971kb (C:5164 M:0 P1:5807) o=1 b=1 i#4:P<CsMsm(1)> 0+0 v=11473kb (C:5164 M:0 P1:6309) o=1 b=1 i#5:P<Msm(0)CsShMsrDCbDomoJwWsO>Pbc => 11654kb, p=1.028904ms (max 1.953347), cycle 9.836873ms END]",
	"GC END!",
	"[GC<0x7f8122400108>: finalize 0.047360ms]",
];

test("JSC's GC log folds into collections, pause and cycle time; other stderr is left alone", () => {
	let clock = 0;
	const totals = createGcLogTotals({ now: () => clock });
	for (const line of GC_LOG) {
		expect(isGcLogLine(line)).toBe(true);
		totals.consume(line);
	}
	expect(isGcLogLine("error: something the worker said")).toBe(false);
	const read = totals.read();
	expect(read).toMatchObject({
		collections: 2,
		edenCollections: 1,
		fullCollections: 1,
		maxPauseMs10s: 1.949697,
	});
	expect(read.pauseMs).toBeCloseTo(
		1.237194 + 0.01807 + 1.949697 + 0.782233 + 1.028904 + 0.04736,
		6,
	);
	expect(read.cycleMs).toBeCloseTo(1.201334 + 9.836873, 6);
	clock = 10_001;
	expect(totals.read().maxPauseMs10s).toBe(0);
});

test("a window reports the GC the launcher counted since the last one", () => {
	const path = join(tmpdir(), `gc-totals-${process.pid}.json`);
	const write = (totals: GcTotals) =>
		writeFileSync(path, JSON.stringify(totals));
	write({
		collections: 10,
		edenCollections: 9,
		fullCollections: 1,
		pauseMs: 20,
		maxPauseMs10s: 3,
		cycleMs: 50,
	});
	const stats = createProcessStats({ gcTotalsPath: path });
	try {
		write({
			collections: 25,
			edenCollections: 23,
			fullCollections: 2,
			pauseMs: 45.5,
			maxPauseMs10s: 4,
			cycleMs: 90,
		});
		expect(stats.readWindow().gc).toEqual({
			collections: 15,
			edenCollections: 14,
			fullCollections: 1,
			pauseMs: 25.5,
			maxPauseMs10s: 4,
			cycleMs: 40,
		});
	} finally {
		stats.stop();
		rmSync(path, { force: true });
	}
});
