import { afterEach, describe, expect, test } from "bun:test";
import {
	type AtomHealthSource,
	readAtomHealth,
} from "../../../src/init/atomHealth.js";
import type { HealthInterval } from "../../../src/init/healthInterval.js";
import { startHealthLog } from "../../../src/init/startHealthLog.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";

const EVERY_MS = 10;

const source: AtomHealthSource = {
	bootedAt: "2026-10-07T00:00:00.000Z",
	restarts: new Int32Array(new SharedArrayBuffer(4)),
	threadStats: createThreadStatsBuffer({ threads: 2 }),
};
/** `Atomics.load` on a plain object throws, so reading this one's health fails. */
const unreadable = {
	...source,
	restarts: {} as Int32Array,
};

type Line = { level: "info" | "warn"; fields: object; message: string };
const createLogger = ({ failing = [] }: { failing?: Line["level"][] } = {}) => {
	const logged: Line[] = [];
	const record =
		(level: Line["level"]) => (fields: object, message: string) => {
			if (failing.includes(level)) throw new Error(`${level} failed`);
			logged.push({ level, fields, message });
		};
	return { logged, logger: { info: record("info"), warn: record("warn") } };
};

const started: { stop(): void }[] = [];
const start = (params: Parameters<typeof startHealthLog>[0]) => {
	const healthLog = startHealthLog(params);
	started.push(healthLog);
	return healthLog;
};
afterEach(() => {
	for (const healthLog of started.splice(0)) healthLog.stop();
});

describe("the health log", () => {
	test("logs what /health reports, every interval", async () => {
		const { logged, logger } = createLogger();
		start({ source, everyMs: EVERY_MS, logger });

		await Bun.sleep(EVERY_MS * 5);

		expect(logged.length).toBeGreaterThanOrEqual(2);
		for (const line of logged)
			expect(line).toEqual({
				level: "info",
				fields: {
					type: "atom_health",
					data: { ...readAtomHealth(source), interval: expect.any(Object) },
				},
				message: "atom health",
			});
	});

	test("each line reports what its threads did since the line before, the first since boot", () => {
		const threadStats = createThreadStatsBuffer({ threads: 2 });
		const [thread0, thread1] = [0, 1].map((index) =>
			openThreadCounters({ buffer: threadStats, index }),
		);
		const { logged, logger } = createLogger();
		const healthLog = start({
			source: { ...source, bootedAt: new Date().toISOString(), threadStats },
			everyMs: 60_000,
			logger,
		});
		const intervalOf = (line: Line | undefined) =>
			(line?.fields as { data: { interval: HealthInterval } }).data.interval;

		thread0?.add("requests", 3);
		thread1?.add("requests", 2);
		thread1?.add("forwarded");
		healthLog.log();
		thread0?.add("requests", 4);
		thread0?.add("pushes");
		healthLog.log();

		expect(intervalOf(logged[0])).toMatchObject({
			requests: 5,
			forwarded: 1,
			pushes: 0,
			seconds: expect.any(Number),
		});
		expect(intervalOf(logged[1])).toMatchObject({
			requests: 4,
			forwarded: 0,
			pushes: 1,
		});
	});

	test("logs nothing once stopped, and stopping twice is harmless", async () => {
		const { logged, logger } = createLogger();
		const healthLog = start({ source, everyMs: EVERY_MS, logger });
		await Bun.sleep(EVERY_MS * 3);

		healthLog.stop();
		healthLog.stop();
		const before = logged.length;
		await Bun.sleep(EVERY_MS * 5);

		expect(logged).toHaveLength(before);
	});

	test("health it cannot read is a warning, never a throw, and the next tick tries again", async () => {
		const { logged, logger } = createLogger();
		const healthLog = start({ source: unreadable, everyMs: EVERY_MS, logger });

		expect(() => healthLog.log()).not.toThrow();
		await Bun.sleep(EVERY_MS * 5);

		expect(logged.length).toBeGreaterThanOrEqual(2);
		for (const line of logged)
			expect(line).toMatchObject({
				level: "warn",
				fields: {
					type: "atom_health_log_failed",
					error: expect.any(TypeError),
				},
			});
	});

	test("a logger that throws, on info and on the warning too, never throws out of a tick", async () => {
		const infoFails = createLogger({ failing: ["info"] });
		const bothFail = createLogger({ failing: ["info", "warn"] });
		const warned = start({
			source,
			everyMs: EVERY_MS,
			logger: infoFails.logger,
		});
		const silent = start({
			source,
			everyMs: EVERY_MS,
			logger: bothFail.logger,
		});

		expect(() => warned.log()).not.toThrow();
		expect(() => silent.log()).not.toThrow();
		await Bun.sleep(EVERY_MS * 5);

		expect(infoFails.logged[0]).toMatchObject({
			level: "warn",
			fields: { type: "atom_health_log_failed" },
		});
		expect(bothFail.logged).toEqual([]);
	});
});
