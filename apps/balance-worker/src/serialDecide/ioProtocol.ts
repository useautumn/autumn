import type { RingLayout } from "./ring.js";

/**
 * What crosses between an I/O worker and the main thread.
 *
 *  REQ  io → main  [u32 reqId][u32 metaLen][meta json][body]      meta = { m, u, h }
 *  RES  main → io  [u32 reqId][u16 status][u32 metaLen][meta json][body]   meta = { h }
 *
 * A frame the ring cannot carry (a body near the ring's size) travels by `postMessage` with the same ids.
 */
export const FRAME = { REQ: 1, RES: 2 } as const;
export const REQ_HEADER_BYTES = 8;
export const RES_HEADER_BYTES = 10;

export type RequestMeta = { m: string; u: string; h: [string, string][] };
export type ResponseMeta = { h: [string, string][] };

export type IoWorkerInit = {
	index: number;
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	commandRing: RingLayout;
	resultRing: RingLayout;
	/** Rung by the I/O worker when it publishes commands; the main thread sleeps on it. */
	commandBell: SharedArrayBuffer;
	/** Rung by the main thread when it publishes results; this worker sleeps on it. */
	resultBell: SharedArrayBuffer;
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
	| { kind: "stats"; index: number; stats: Record<string, number> }
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
