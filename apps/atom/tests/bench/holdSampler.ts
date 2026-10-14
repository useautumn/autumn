import { Database } from "bun:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Journal } from "../../src/state/journal/types/journal.js";
import { startWalCheckpointer } from "../../src/state/startWalCheckpointer.js";
import { readSqliteWriterThreadStats } from "../../src/state/writer/getSqliteWriter.js";

const BIN_MS = 10_000;

const processWriteBytes = () =>
	Number(
		/write_bytes: (\d+)/.exec(readFileSync("/proc/self/io", "utf8"))?.[1] ?? 0,
	);

const sizeOf = (path: string) => (existsSync(path) ? statSync(path).size : 0);

/** Per 10 s of a hold: the writer's wait, the loop's lag, sheds, unsent, the logs' sizes, checkpoint time and disk bytes. */
export const startHoldSampler = ({
	folder,
	journal,
}: {
	folder: string;
	journal: Journal;
}) => {
	const checkpointer = startWalCheckpointer({
		dataDir: folder,
		logger: { warn: () => {} },
	});
	const checkpoint = checkpointer.checkpoint;
	let checkpointMs = 0;
	let checkpointMaxMs = 0;
	checkpointer.checkpoint = () => {
		const startedAt = performance.now();
		checkpoint();
		const ms = performance.now() - startedAt;
		checkpointMs += ms;
		checkpointMaxMs = Math.max(checkpointMaxMs, ms);
	};
	let lagMaxMs = 0;
	let dueAt = performance.now() + 100;
	const lagTimer = setInterval(() => {
		lagMaxMs = Math.max(lagMaxMs, performance.now() - dueAt);
		dueAt = performance.now() + 100;
	}, 100);
	let sheds = 0;
	let latencies: number[] = [];
	let writeBytes = processWriteBytes();
	let roundTrips = readSqliteWriterThreadStats().sqliteWriterRoundTrips;
	let unsentMax = 0;
	const unsentTimer = setInterval(() => {
		unsentMax = Math.max(unsentMax, journal.countUnsent());
	}, 100);
	const journalPath = join(folder, "journal.sqlite");
	const reader = new Database(journalPath, { readonly: true });
	const keyRows = () => {
		try {
			return Number(
				(
					reader.query("SELECT count(*) AS n FROM journal_keys").get() as {
						n: number;
					}
				).n,
			);
		} catch {
			return 0;
		}
	};
	const startedAt = performance.now();
	const bin = setInterval(() => {
		const writer = readSqliteWriterThreadStats();
		const nowBytes = processWriteBytes();
		latencies.sort((a, b) => a - b);
		console.error(
			JSON.stringify({
				t: Math.round((performance.now() - startedAt) / 1000),
				writerWaitP99Us: writer.sqliteWriterWaitP99Us,
				writerRoundTrips: writer.sqliteWriterRoundTrips - roundTrips,
				loopLagMaxMs: Math.round(lagMaxMs),
				latencyP99Ms: Number(
					(latencies[Math.floor(latencies.length * 0.99)] ?? 0).toFixed(1),
				),
				sheds,
				unsentMax,
				journalWalMB: Number(
					(sizeOf(`${journalPath}-wal`) / 2 ** 20).toFixed(2),
				),
				journalDbMB: Number((sizeOf(journalPath) / 2 ** 20).toFixed(2)),
				slotWalMB: Number(
					(sizeOf(join(folder, "slot.sqlite-wal")) / 2 ** 20).toFixed(2),
				),
				diskWriteMB: Number(((nowBytes - writeBytes) / 2 ** 20).toFixed(1)),
				checkpointMs: Math.round(checkpointMs),
				checkpointMaxMs: Math.round(checkpointMaxMs),
				keyRows: keyRows(),
			}),
		);
		roundTrips = writer.sqliteWriterRoundTrips;
		writeBytes = nowBytes;
		lagMaxMs = 0;
		sheds = 0;
		latencies = [];
		unsentMax = 0;
		checkpointMs = 0;
		checkpointMaxMs = 0;
	}, BIN_MS);
	return {
		latency: (ms: number) => latencies.push(ms),
		shed: () => {
			sheds++;
		},
		stop: () => {
			for (const timer of [lagTimer, unsentTimer, bin]) clearInterval(timer);
			checkpointer.stop();
			reader.close();
		},
	};
};
