import { type Doorbell, type RingLayout } from "./ring.ts";

/**
 * Frame types on the rings. Every frame is `[u32 len][u8 type][payload]` (see ring.ts).
 *
 *  CMD   io → sequencer   [u32 reqId][u8 kind][u32 budgetMs][utf8 request json]
 *  RES   sequencer → io   [u32 reqId][u32 seq][u16 status][utf8 body]      seq 0 = release at once
 *  REC   sequencer → kafka[u32 seq][u32 keyLen][key][value]                 one Kafka record
 *  ACK   kafka → sequencer[u32 fromSeq][u32 toSeq][i64 baseOffset]          baseOffset < 0 = failed (code)
 *
 * `commitPos` (one Int32 cell) is Aeron's commit position: the highest seq Kafka has acknowledged.
 * I/O workers release held replies with seq ≤ commitPos; the sequencer finishes its bookkeeping for them.
 */
export const FRAME = { CMD: 1, RES: 2, REC: 3, ACK: 4 } as const;
export const KIND = { TRACK: 1, CHECK: 2 } as const;

export const CMD_HEADER = 9;
export const RES_HEADER = 10;
export const REC_HEADER = 8;
export const ACK_BYTES = 16;

/** baseOffset codes in an ACK for a batch that did not commit. */
export const ACK_FAILED_UNCOMMITTED = -1n;
export const ACK_FAILED_UNKNOWN = -2n;

export type SharedCells = {
	/** [0] = commitPos (highest acknowledged seq), [1] = failedFrom (0 = none), [2] = failedTo, [3] = recovery flag. */
	sab: SharedArrayBuffer;
};

export const CELL_COMMIT = 0;
export const CELL_FAILED_FROM = 1;
export const CELL_FAILED_TO = 2;
export const CELL_RECOVERY = 3;

export type IoWorkerInit = {
	role: "io";
	index: number;
	port: number;
	commandRing: RingLayout;
	resultRing: RingLayout;
	sequencerBell: SharedArrayBuffer;
	resultBell: SharedArrayBuffer;
	cells: SharedArrayBuffer;
	logRate: number;
};

export type SequencerInit = {
	role: "sequencer";
	core: "processor" | "lean";
	commandRings: RingLayout[];
	resultRings: RingLayout[];
	sequencerBell: SharedArrayBuffer;
	resultBells: SharedArrayBuffer[];
	recordRing: RingLayout;
	recordBell: SharedArrayBuffer;
	ackRing: RingLayout;
	cells: SharedArrayBuffer;
	appender: "kafka" | "sim";
	logRate: number;
	yieldEvery: number;
};

export type KafkaWorkerInit = {
	role: "kafka";
	recordRing: RingLayout;
	recordBell: SharedArrayBuffer;
	ackRing: RingLayout;
	sequencerBell: SharedArrayBuffer;
	resultBells: SharedArrayBuffer[];
	cells: SharedArrayBuffer;
	appender: "kafka" | "sim";
	lingerMs: number;
	maxBatchSize: number;
	maxBatchBytes: number;
	commitMode: "transactional" | "idempotent";
};

export type WorkerInit = IoWorkerInit | SequencerInit | KafkaWorkerInit;

export type Stats = Record<string, number>;

export function ringsOf(doorbell: Doorbell): SharedArrayBuffer {
	return doorbell.sab;
}
