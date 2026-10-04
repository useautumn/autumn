import type { RingLayout } from "./ring.js";

/**
 * What crosses between an I/O worker and the main thread.
 *
 *  REQ  io → main  [u32 reqId][u32 metaLen][meta json][body]      meta = { m, u, h }
 *  RES  main → io  [u32 reqId][u16 status][u32 metaLen][meta json][body]   meta = { h }
 *
 * The hot frames (HOT, HOT_RES, FAIL) are laid out in hotProtocol.ts. A frame too big for its ring (over an
 * eighth of it) travels by `postMessage` with the same ids; a hot reply that big is released by the main thread.
 */
export const FRAME = { REQ: 1, RES: 2, HOT: 3, HOT_RES: 4, FAIL: 5 } as const;
export const REQ_HEADER_BYTES = 8;
export const RES_HEADER_BYTES = 10;

export type RequestMeta = { m: string; u: string; h: [string, string][] };
export type ResponseMeta = { h: [string, string][] };

/** Slots of a lane's live counters: a Float64Array the worker alone writes and the main thread reads any time. */
export const LANE_STAT = {
	requests: 0,
	ringFull: 1,
	oversized: 2,
	wakes: 3,
	pending: 4,
	hot: 5,
	hotHeld: 6,
	hotReleased: 7,
	hotFailed: 8,
	held: 9,
} as const;
export const LANE_STAT_SLOTS = Object.keys(LANE_STAT).length;

export type IoWorkerInit = {
	index: number;
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	commandRing: RingLayout;
	resultRing: RingLayout;
	/** Rung by the I/O worker when it publishes commands; the main thread sleeps on it. */
	commandBell: SharedArrayBuffer;
	/** Rung by the main thread when it publishes results or a commit position moves; this worker sleeps on it. */
	resultBell: SharedArrayBuffer;
	/** `LANE_STAT_SLOTS` float64 counters this worker keeps. */
	stats: SharedArrayBuffer;
	/** Serial-decide arm D: hot routes cross as HOT frames and their replies are held on these commit positions
	 *  (BigInt64 per partition); `failGenerations` counts each partition's failures (Int32 per partition). */
	hot?: {
		cells: SharedArrayBuffer;
		failGenerations: SharedArrayBuffer;
		partitionCount: number;
	};
};

/** Requests and replies too big for a ring frame. */
export type OversizedRequest = {
	kind: "request";
	reqId: number;
	meta: RequestMeta;
	body: ArrayBuffer;
};
export type OversizedResponse = {
	kind: "response";
	reqId: number;
	status: number;
	meta: ResponseMeta;
	body: ArrayBuffer;
};

export type IoWorkerMessage =
	| { kind: "ready"; index: number; port: number }
	| { kind: "stopped"; index: number }
	| { kind: "error"; index: number; message: string }
	| OversizedRequest;

export type MainMessage = { kind: "stop" } | OversizedResponse;

/** Hop-by-hop or connection-bound headers a synthesized `Request` must not carry. */
const DROPPED_REQUEST_HEADERS = new Set([
	"host",
	"content-length",
	"connection",
	"transfer-encoding",
	"keep-alive",
	"expect",
]);

export function forwardableHeaders(headers: Headers): [string, string][] {
	const out: [string, string][] = [];
	headers.forEach((value, name) => {
		if (!DROPPED_REQUEST_HEADERS.has(name)) out.push([name, value]);
	});
	return out;
}

/** The body the client sees when the command ring is full; the same code the writer uses at capacity. */
export const RING_FULL_BODY = JSON.stringify({
	error: {
		code: "OVERLOADED",
		message: "Worker request queue is full; retry with backoff",
	},
});
