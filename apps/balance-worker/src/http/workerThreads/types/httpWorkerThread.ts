import type { Ring } from "../../../threads/ring/types/ring.js";
import type { RequestMeta } from "../frames/requestFrame.js";

/** What the decide thread hands an HTTP worker thread when it starts it. */
export type HttpWorkerInit = {
	index: number;
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	requestRing: Ring;
	replyRing: Ring;
	/** Woken by this thread when it publishes requests; the decide thread sleeps on it. */
	requestSignal: SharedArrayBuffer;
	/** Woken by the decide thread when it publishes replies; this thread sleeps on it. */
	replySignal: SharedArrayBuffer;
};

/** A request or reply over an eighth of its ring travels by `postMessage` instead, with the same id. */
export type LargeRequest = {
	kind: "request";
	reqId: number;
	meta: RequestMeta;
	body: ArrayBuffer;
};

export type LargeReply = {
	kind: "reply";
	reqId: number;
	status: number;
	headers: [string, string][];
	body: ArrayBuffer;
};

export type HttpWorkerMessage =
	| { kind: "ready" }
	| { kind: "stopped" }
	| { kind: "error"; message: string }
	| LargeRequest;

export type DecideThreadMessage = { kind: "stop" } | LargeReply;
