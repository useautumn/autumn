/**
 * Supervisor for the serial-decide spike: N I/O workers (Bun.serve, SO_REUSEPORT) → SAB command rings →
 * one sequencer → record ring → one Kafka worker; replies flow back over per-worker result rings and are
 * released at the commit position. The main thread only wires the rings and reports thread ids.
 *
 *   IO_WORKERS=2 CORE=lean|processor APPENDER=kafka|sim PORT=8093 LOG_RATE=0.05 COMMIT_MODE=transactional
 *   PIN_IO=2 PIN_SEQUENCER=3 PIN_KAFKA=2   (optional per-role CPU sets; otherwise taskset applies)
 */
import { allocateRing, Doorbell } from "./ring.ts";
import type { IoWorkerInit, KafkaWorkerInit, SequencerInit } from "./protocol.ts";

const ioWorkers = Number(process.env.IO_WORKERS ?? 2);
const core = (process.env.CORE ?? "lean") as "lean" | "processor";
const appender = (process.env.APPENDER ?? "kafka") as "kafka" | "sim";
const port = Number(process.env.PORT ?? 8093);
const logRate = Number(process.env.LOG_RATE ?? 0.05);
const commitMode = (process.env.COMMIT_MODE ?? "transactional") as "transactional" | "idempotent";
// The writer already lingers in processor mode; the Kafka worker lingers for the lean core.
const lingerMs = Number(process.env.KAFKA_LINGER_MS ?? (core === "lean" ? 5 : 0));
const yieldEvery = Number(process.env.YIELD_EVERY ?? 1);

const COMMAND_RING = 1 << 22;
const RESULT_RING = 1 << 24;
const RECORD_RING = 1 << 24;
const ACK_RING = 1 << 16;

const cells = new SharedArrayBuffer(64);
const sequencerBell = new Doorbell();
const recordBell = new Doorbell();
const commandRings = Array.from({ length: ioWorkers }, () => allocateRing({ capacity: COMMAND_RING }));
const resultRings = Array.from({ length: ioWorkers }, () => allocateRing({ capacity: RESULT_RING }));
const resultBells = Array.from({ length: ioWorkers }, () => new Doorbell());
const recordRing = allocateRing({ capacity: RECORD_RING });
const ackRing = allocateRing({ capacity: ACK_RING });

const threads: Record<string, { tid: number; cpus: number[] | null }> = {};
const stats: Record<string, Record<string, number>> = {};
let readyCount = 0;
const expected = ioWorkers + 2;

function onReport(name: string, data: { ready?: boolean; tid?: number; cpus?: number[] | null; stats?: Record<string, number> }): void {
		if (data.ready) {
			threads[name] = { tid: data.tid as number, cpus: data.cpus ?? null };
			readyCount++;
			if (readyCount === expected) {
				console.error(`READY ${JSON.stringify({ pid: process.pid, port, core, appender, ioWorkers, threads })}`);
			}
		}
		if (data.stats) stats[name] = data.stats;
}

function spawn(file: string, init: IoWorkerInit | SequencerInit | KafkaWorkerInit, name: string): Worker {
	const worker = new Worker(new URL(file, import.meta.url).href);
	worker.onmessage = (event: MessageEvent) => onReport(name, event.data);
	worker.onerror = (event) => {
		console.error(`${name} error:`, event.message);
		process.exit(1);
	};
	worker.postMessage(init);
	return worker;
}

const kafka = spawn(
	"./kafkaWorker.ts",
	{
		role: "kafka",
		recordRing,
		recordBell: recordBell.sab,
		ackRing,
		sequencerBell: sequencerBell.sab,
		resultBells: resultBells.map((bell) => bell.sab),
		cells,
		appender,
		lingerMs,
		maxBatchSize: 500,
		maxBatchBytes: 800_000,
		commitMode,
	},
	"kafka",
);
const sequencerInit: SequencerInit = {
		role: "sequencer",
		core,
		commandRings,
		resultRings,
		sequencerBell: sequencerBell.sab,
		resultBells: resultBells.map((bell) => bell.sab),
		recordRing,
		recordBell: recordBell.sab,
		ackRing,
		cells,
		appender,
		logRate,
		yieldEvery,
};
// SEQUENCER_ON_MAIN=1 hosts the sequencer on the main thread so `bun --cpu-prof` can profile it.
const onMain = process.env.SEQUENCER_ON_MAIN === "1";
const sequencer = onMain ? null : spawn("./sequencer.ts", sequencerInit, "sequencer");
const ios = Array.from({ length: ioWorkers }, (_, index) =>
	spawn(
		"./ioWorker.ts",
		{
			role: "io",
			index,
			port,
			commandRing: commandRings[index] as (typeof commandRings)[number],
			resultRing: resultRings[index] as (typeof resultRings)[number],
			sequencerBell: sequencerBell.sab,
			resultBell: (resultBells[index] as Doorbell).sab,
			cells,
			logRate,
		},
		`io${index}`,
	),
);

if (process.env.STATS === "1")
	setInterval(() => console.error(`STATS ${JSON.stringify(stats)}`), 5000).unref();

function shutdown(): void {
	console.error(`FINAL ${JSON.stringify(stats)}`);
	for (const worker of [kafka, sequencer, ...ios]) worker?.terminate();
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (onMain) {
	const { start } = await import("./sequencer.ts");
	void start(sequencerInit, (message) => onReport("sequencer", message as never));
}
