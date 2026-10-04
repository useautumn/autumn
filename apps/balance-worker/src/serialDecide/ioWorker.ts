/**
 * An I/O worker: owns one `Bun.serve` on the worker's port (SO_REUSEPORT spreads connections over the
 * pool), reads each request's bytes, hands them to the main thread over its command ring and answers
 * with the bytes the main thread sends back. Nothing here knows a route or touches balance state.
 */
import {
	FRAME,
	forwardableHeaders,
	type IoWorkerInit,
	type MainMessage,
	REQ_HEADER_BYTES,
	RES_HEADER_BYTES,
	type RequestMeta,
	type ResponseMeta,
	RING_FULL_BODY,
} from "./ioProtocol.js";
import { Doorbell, RingConsumer, RingProducer } from "./ring.js";

declare var self: Worker;

const JSON_HEADERS = { "content-type": "application/json" };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Pending = { resolve(response: Response): void };

let started = false;

self.onmessage = (event: MessageEvent<IoWorkerInit | MainMessage>) => {
	const message = event.data;
	if ("kind" in message) {
		onMainMessage(message);
		return;
	}
	if (started) return;
	started = true;
	start(message);
};

let onMainMessage: (message: MainMessage) => void = () => undefined;

function start(init: IoWorkerInit): void {
	const commands = new RingProducer(
		init.commandRing,
		new Doorbell(init.commandBell),
	);
	const results = new RingConsumer(init.resultRing);
	const resultBell = new Doorbell(init.resultBell);
	const pending = new Map<number, Pending>();
	let nextReqId = 1;
	const stats = { requests: 0, ringFull: 0, oversized: 0, wakes: 0 };
	// Bodies near the ring's size go by postMessage; the ring is for the hot, small requests.
	const oversizedThreshold = Math.min(
		init.commandRing.capacity >>> 3,
		256 * 1024,
	);

	function respond({
		reqId,
		status,
		meta,
		body,
	}: {
		reqId: number;
		status: number;
		meta: ResponseMeta;
		body: Uint8Array | ArrayBuffer;
	}): void {
		const waiting = pending.get(reqId);
		if (!waiting) return;
		pending.delete(reqId);
		waiting.resolve(new Response(body, { status, headers: meta.h }));
	}

	function drainResults(): number {
		let n = 0;
		for (;;) {
			const frame = results.next();
			if (!frame) break;
			if (frame.type !== FRAME.RES)
				throw new Error(
					`I/O worker ${init.index}: unexpected frame ${frame.type}`,
				);
			const view = results.payloadView;
			const reqId = view.getUint32(frame.offset, true);
			const status = view.getUint16(frame.offset + 4, true);
			const metaLength = view.getUint32(frame.offset + 6, true);
			const meta = JSON.parse(
				decoder.decode(
					frame.bytes.subarray(RES_HEADER_BYTES, RES_HEADER_BYTES + metaLength),
				),
			) as ResponseMeta;
			// A copy: the ring slot is reused as soon as we advance.
			const body = frame.bytes.slice(RES_HEADER_BYTES + metaLength);
			results.advance();
			n++;
			respond({ reqId, status, meta, body });
		}
		if (n > 0) results.release();
		return n;
	}

	async function resultLoop(): Promise<void> {
		for (;;) {
			drainResults();
			stats.wakes++;
			await resultBell.sleep({
				hasWork: () => results.hasWork(),
				timeoutMs: 50,
			});
		}
	}

	async function forward(request: Request): Promise<Response> {
		const url = request.url;
		const pathStart = url.indexOf("/", url.indexOf("//") + 2);
		const meta: RequestMeta = {
			m: request.method,
			u: pathStart === -1 ? "/" : url.slice(pathStart),
			h: forwardableHeaders(request.headers),
		};
		const body = new Uint8Array(await request.arrayBuffer());
		const metaText = JSON.stringify(meta);
		const reqId = nextReqId++;
		if (nextReqId === 0xffffffff) nextReqId = 1;
		const { promise, resolve } = Promise.withResolvers<Response>();
		const maxLength = REQ_HEADER_BYTES + metaText.length * 3 + body.length;
		if (maxLength > oversizedThreshold) {
			stats.oversized++;
			pending.set(reqId, { resolve });
			postMessage({ kind: "request", reqId, meta, body: body.buffer }, [
				body.buffer,
			]);
			return promise;
		}
		const at = commands.claim({ type: FRAME.REQ, maxLength });
		if (at < 0) {
			stats.ringFull++;
			return new Response(RING_FULL_BODY, {
				status: 429,
				headers: JSON_HEADERS,
			});
		}
		const view = commands.payloadView;
		view.setUint32(at, reqId, true);
		const { written } = encoder.encodeInto(
			metaText,
			commands.payload.subarray(
				at + REQ_HEADER_BYTES,
				at + maxLength - body.length,
			),
		);
		view.setUint32(at + 4, written, true);
		commands.payload.set(body, at + REQ_HEADER_BYTES + written);
		commands.publish({ length: REQ_HEADER_BYTES + written + body.length });
		stats.requests++;
		pending.set(reqId, { resolve });
		commands.flush();
		return promise;
	}

	let server: ReturnType<typeof Bun.serve>;
	try {
		server = Bun.serve({
			hostname: init.hostname,
			port: init.port,
			reusePort: true,
			idleTimeout: 0,
			maxRequestBodySize: init.maxRequestBodySize,
			fetch: forward,
		});
	} catch (cause) {
		postMessage({
			kind: "error",
			index: init.index,
			message: String((cause as Error)?.message ?? cause),
		});
		return;
	}

	onMainMessage = (message) => {
		if (message.kind === "response") {
			respond({
				reqId: message.reqId,
				status: message.status,
				meta: message.meta,
				body: message.body,
			});
			return;
		}
		if (message.kind === "stop") {
			void server
				.stop(true)
				.then(() => postMessage({ kind: "stopped", index: init.index }));
		}
	};

	void resultLoop();
	postMessage({ kind: "ready", index: init.index, port: server.port });
	setInterval(
		() =>
			postMessage({
				kind: "stats",
				index: init.index,
				stats: { ...stats, pending: pending.size },
			}),
		10_000,
	).unref();
}
