/** Requests coming in: drained off every lane's request ring into the worker's own `fetch`. */
import {
	REQUEST_FRAME,
	type RequestMeta,
	readRequestFrame,
} from "../frames/requestFrame.js";
import type { HttpWorkerLane } from "../types/httpWorkerLane.js";
import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import { reportPoolFailure } from "./reportPoolFailure.js";
import { replyToLane } from "./sendReplies.js";

const MAX_FRAMES_PER_DRAIN = 512;

function requestOf({
	scope,
	meta,
	body,
}: {
	scope: HttpWorkerPoolScope;
	meta: RequestMeta;
	body: Uint8Array | ArrayBuffer;
}): Request {
	const { hostname, port } = scope.config;
	const hasBody = meta.method !== "GET" && meta.method !== "HEAD";
	return new Request(`http://${hostname}:${port}${meta.path}`, {
		method: meta.method,
		headers: meta.headers,
		body: hasBody ? body : undefined,
	});
}

/** Answers one request through `fetch`; a handler that throws is answered 500, never left hanging. */
export async function serveRequest({
	scope,
	lane,
	reqId,
	meta,
	body,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
	reqId: number;
	meta: RequestMeta;
	body: Uint8Array | ArrayBuffer;
}): Promise<void> {
	let response: Response;
	let replyBody: Uint8Array;
	try {
		response = await scope.ctx.fetch(requestOf({ scope, meta, body }));
		replyBody = new Uint8Array(await response.arrayBuffer());
	} catch (cause) {
		scope.ctx.logger.error(
			{ error: cause },
			"HTTP worker request failed on the decide thread",
		);
		response = new Response(null, { status: 500 });
		replyBody = new Uint8Array(0);
	}
	try {
		replyToLane({ scope, lane, reqId, response, body: replyBody });
	} catch (cause) {
		// Only a dead thread refuses a reply (postMessage on a terminated thread).
		reportPoolFailure({ scope, cause });
	}
}

function drainLane({
	scope,
	lane,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
}): number {
	let read = 0;
	while (read < MAX_FRAMES_PER_DRAIN) {
		const frame = lane.requests.next();
		if (!frame) break;
		if (frame.type !== REQUEST_FRAME)
			throw new Error(`HTTP worker pool: unexpected frame ${frame.type}`);
		const { reqId, meta, body } = readRequestFrame({
			reader: lane.requests,
			frame,
		});
		lane.requests.advance();
		read++;
		void serveRequest({ scope, lane, reqId, meta, body });
	}
	if (read > 0) lane.requests.release();
	return read;
}

/** Drains until the pool stops; a frame it cannot read means a broken ring, which nothing downstream recovers. */
export async function runDispatchLoop({
	scope,
}: {
	scope: HttpWorkerPoolScope;
}): Promise<void> {
	const { state } = scope;
	function hasRequests(): boolean {
		return state.lanes.some((lane) => lane.requests.hasWork());
	}
	while (!state.stopping) {
		let read = 0;
		for (const lane of state.lanes) read += drainLane({ scope, lane });
		if (read > 0) {
			// Let the dispatched requests run before the next batch, so a flood cannot starve replies.
			await new Promise<void>((resolve) => setImmediate(resolve));
			continue;
		}
		await state.requestSignal.sleep({ hasWork: hasRequests, timeoutMs: 20 });
	}
}

export function startDispatchLoop({
	scope,
}: {
	scope: HttpWorkerPoolScope;
}): void {
	runDispatchLoop({ scope }).catch((cause) =>
		reportPoolFailure({ scope, cause }),
	);
}
