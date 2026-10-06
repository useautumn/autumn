import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createProcessStatsReader,
	startProcessStats,
} from "../../../src/init/processStats.js";

const newStatsDir = () => mkdtempSync(join(tmpdir(), "atom-stats-"));

const startStats = ({ statsDir }: { statsDir: string }) => {
	const warned: object[] = [];
	let now = 0;
	const stats = startProcessStats({
		index: 2,
		statsDir,
		logger: { warn: (fields) => warned.push(fields) },
		clock: () => now,
		now: () => new Date("2026-10-05T23:00:00.000Z"),
	});
	return {
		stats,
		warned,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

describe("process stats", () => {
	test("each thread publishes its own checks per second and the cores it used", () => {
		const statsDir = newStatsDir();
		let now = 0;
		let cpu = 0;
		const stats = startProcessStats({
			index: 1,
			statsDir,
			logger: { warn: () => {} },
			clock: () => now,
			cpuMs: () => cpu,
		});
		const check = { path: "/v1/balances.check", forwarded: false, bytes: 0 };

		for (let i = 0; i < 300; i++)
			stats.recordRequest({ ...check, durationMs: 1 });
		now += 1000;
		cpu += 400;
		stats.publish();
		for (let i = 0; i < 100; i++)
			stats.recordRequest({ ...check, durationMs: 1 });
		now += 1000;
		cpu += 600;
		stats.publish();
		stats.stop();

		// Two seconds, 400 checks and one CPU-second: 200/s on half a core.
		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			index: 1,
			checks: 400,
			checksPerSecond: 200,
			cpuCores: 0.5,
		});
	});

	test("a late event loop is recorded and a stall is logged once", () => {
		const statsDir = newStatsDir();
		const { stats, warned, advance } = startStats({ statsDir });

		advance(20);
		stats.probeLag();
		advance(170);
		stats.probeLag();
		stats.publish();
		stats.stop();

		const [published] = createProcessStatsReader({ statsDir })();
		expect(published).toMatchObject({ index: 2, loopLagMaxMs: 150 });
		expect(warned).toEqual([
			{ type: "atom_event_loop_stall", lagMs: 150, index: 2 },
		]);
	});

	test("answered checks, forwards and pushes are timed separately; other paths are not counted", () => {
		const statsDir = newStatsDir();
		const { stats } = startStats({ statsDir });
		const check = { path: "/v1/balances.check", forwarded: false, bytes: 0 };

		stats.recordRequest({ ...check, durationMs: 3 });
		stats.recordRequest({ ...check, durationMs: 9 });
		stats.recordRequest({ ...check, durationMs: 140, forwarded: true });
		stats.recordRequest({
			path: "/v1/subjects.set",
			durationMs: 40,
			forwarded: false,
			bytes: 3000,
		});
		stats.recordRequest({
			path: "/v1/atoms.get",
			durationMs: 500,
			forwarded: false,
			bytes: 0,
		});
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			checks: 2,
			checkMaxMs: 9,
			forwards: 1,
			forwardMaxMs: 140,
			pushes: 1,
			pushMaxMs: 40,
			checkTotalMs: 12,
			pushTotalMs: 40,
			pushBytes: 3000,
		});
	});

	test("each publish counts the subject reads and parses since the last", () => {
		const statsDir = newStatsDir();
		const counts = { reads: 10, parses: 4 };
		const stats = startProcessStats({
			index: 0,
			statsDir,
			logger: { warn: () => {} },
			subjectReadCounts: () => counts,
		});
		counts.reads = 25;
		counts.parses = 6;
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			subjectReads: 15,
			subjectParses: 2,
		});
	});

	test("each publish sums the answered checks' phase times since the last", () => {
		const statsDir = newStatsDir();
		const phases = { read: 5, decide: 1, render: 2, respond: 3 };
		const stats = startProcessStats({
			index: 0,
			statsDir,
			logger: { warn: () => {} },
			checkPhaseTotals: () => phases,
		});
		phases.read = 9;
		phases.decide = 11;
		phases.render = 22;
		phases.respond = 4;
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			checkReadMs: 4,
			checkDecideMs: 10,
			checkRenderMs: 20,
			checkRespondMs: 1,
		});
	});

	test("each publish sums the pushes' parse, apply and write times since the last", () => {
		const statsDir = newStatsDir();
		const phases = { parse: 1, apply: 2, write: 1 };
		const stats = startProcessStats({
			index: 0,
			statsDir,
			logger: { warn: () => {} },
			pushPhaseTotals: () => phases,
		});
		phases.parse = 7;
		phases.apply = 12;
		phases.write = 5;
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			pushParseMs: 6,
			pushApplyMs: 10,
			pushWriteMs: 4,
		});
	});

	test("a request waits behind those read before it in the same loop turn; a connection counts once", () => {
		const statsDir = newStatsDir();
		let now = 0;
		const turnEnds: Array<() => void> = [];
		const stats = startProcessStats({
			index: 0,
			statsDir,
			logger: { warn: () => {} },
			clock: () => now,
			afterLoopTurn: (callback) => turnEnds.push(callback),
		});

		stats.noteArrival({ remote: "10.0.0.1:5000" });
		now += 4;
		stats.noteArrival({ remote: "10.0.0.1:5001" });
		now += 6;
		stats.noteArrival({ remote: "10.0.0.1:5000" });
		for (const end of turnEnds.splice(0)) end();
		now += 50;
		stats.noteArrival({ remote: "10.0.0.1:5001" });
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			newConnections: 2,
			queueWaitMaxMs: 10,
			queueWaitTotalMs: 14,
		});
	});

	test("each publish covers the trailing two seconds, so a 2 s poll misses no stall", () => {
		const statsDir = newStatsDir();
		const { stats } = startStats({ statsDir });
		let clock = 0;
		const read = createProcessStatsReader({ statsDir, clock: () => clock });

		stats.recordRequest({
			path: "/v1/balances.check",
			durationMs: 250,
			forwarded: false,
			bytes: 0,
		});
		stats.publish();
		stats.recordRequest({
			path: "/v1/balances.check",
			durationMs: 2,
			forwarded: false,
			bytes: 0,
		});
		stats.publish();
		expect(read()[0]).toMatchObject({ checks: 2, checkMaxMs: 250 });

		stats.publish();
		clock = 1000;
		expect(read()[0]).toMatchObject({ checks: 1, checkMaxMs: 2 });
		stats.stop();
	});

	test("the reader returns every process in order and skips torn files", () => {
		const statsDir = newStatsDir();
		writeFileSync(
			join(statsDir, "process-1.json"),
			JSON.stringify({ index: 1 }),
		);
		writeFileSync(
			join(statsDir, "process-0.json"),
			JSON.stringify({ index: 0 }),
		);
		writeFileSync(join(statsDir, "process-3.json"), "{");

		expect(createProcessStatsReader({ statsDir })()).toEqual([
			{ index: 0 },
			{ index: 1 },
		] as never);
	});
});
