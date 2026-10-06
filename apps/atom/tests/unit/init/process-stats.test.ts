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
