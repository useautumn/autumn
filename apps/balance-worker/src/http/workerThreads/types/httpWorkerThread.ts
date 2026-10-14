import type { Ring } from "../../../threads/ring/types/ring.js";
import type { RequestMeta } from "../frames/requestFrame.js";

export type HttpWorkerInit = {
	index: number;
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	requestRing: Ring;
	replyRing: Ring;
	requestSignal: SharedArrayBuffer;
	replySignal: SharedArrayBuffer;
	heldReplies?: {
		commitCells: SharedArrayBuffer;
		failureCounts: SharedArrayBuffer;
	};
	latency: { routes: string[]; cells: SharedArrayBuffer };
};

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
