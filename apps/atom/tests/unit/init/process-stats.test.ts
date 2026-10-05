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

	test("checks and pushes are timed separately; other paths are not counted", () => {
		const statsDir = newStatsDir();
		const { stats } = startStats({ statsDir });

		stats.recordRequest({ path: "/v1/balances.check", durationMs: 3 });
		stats.recordRequest({ path: "/v1/balances.check", durationMs: 9 });
		stats.recordRequest({ path: "/v1/subjects.set", durationMs: 40 });
		stats.recordRequest({ path: "/v1/atoms.get", durationMs: 500 });
		stats.publish();
		stats.stop();

		expect(createProcessStatsReader({ statsDir })()[0]).toMatchObject({
			checks: 2,
			checkMaxMs: 9,
			pushes: 1,
			pushMaxMs: 40,
		});
	});

	test("each publish covers the trailing two seconds, so a 2 s poll misses no stall", () => {
		const statsDir = newStatsDir();
		const { stats } = startStats({ statsDir });
		let clock = 0;
		const read = createProcessStatsReader({ statsDir, clock: () => clock });

		stats.recordRequest({ path: "/v1/balances.check", durationMs: 250 });
		stats.publish();
		stats.recordRequest({ path: "/v1/balances.check", durationMs: 2 });
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
