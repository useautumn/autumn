/**
 * A TCP proxy per broker that can stall it the way Confluent's brokers stall: every request on
 * every open connection hangs, then the backlog lands at once. Bytes are held in both directions,
 * nothing is dropped and no connection closes, so the client only ever sees latency.
 *
 *   STALL_PROXY_MAP=29192=39192,29292=39292,29392=39392 STALL_PROXY_CONTROL_PORT=29999 bun stallProxy.ts
 *
 * POST /stall {"listen":29192,"holdMs":2000} holds that broker for 2s from now;
 * {"listen":29192,"delayMs":1500,"forMs":60000} instead adds 1.5s to every chunk for a minute.
 */
import type { Socket } from "bun";

type Fault = { holdUntil: number; delayMs: number; delayUntil: number };
type Pipe = {
	queue: { at: number; bytes: Uint8Array }[];
	lastAt: number;
	timer: ReturnType<typeof setTimeout> | null;
	target: Socket<unknown> | null;
	closed: boolean;
};

const mapping = (process.env.STALL_PROXY_MAP ?? "")
	.split(",")
	.filter(Boolean)
	.map((pair) => pair.split("=").map(Number) as [number, number]);
if (mapping.length === 0) throw new Error("STALL_PROXY_MAP is required");
const faults = new Map<number, Fault>(
	mapping.map(([listen]) => [
		listen,
		{ holdUntil: 0, delayMs: 0, delayUntil: 0 },
	]),
);

function deliverAtOf({ fault, now }: { fault: Fault; now: number }): number {
	const delayed = now < fault.delayUntil ? now + fault.delayMs : now;
	return Math.max(delayed, fault.holdUntil);
}

function createPipe(): Pipe {
	return { queue: [], lastAt: 0, timer: null, target: null, closed: false };
}

/** Writes what is due, in order; a partial write waits for the socket's drain. */
function pump({ pipe }: { pipe: Pipe }): void {
	if (pipe.timer) clearTimeout(pipe.timer);
	pipe.timer = null;
	const target = pipe.target;
	if (!target || pipe.closed) return;
	const now = Date.now();
	while (pipe.queue.length > 0) {
		const head = pipe.queue[0];
		if (head.at > now) {
			pipe.timer = setTimeout(() => pump({ pipe }), head.at - now);
			return;
		}
		const written = target.write(head.bytes);
		if (written < head.bytes.length) {
			head.bytes = head.bytes.subarray(Math.max(written, 0));
			return;
		}
		pipe.queue.shift();
	}
}

function enqueue({
	pipe,
	fault,
	bytes,
}: {
	pipe: Pipe;
	fault: Fault;
	bytes: Uint8Array;
}): void {
	const at = Math.max(deliverAtOf({ fault, now: Date.now() }), pipe.lastAt);
	pipe.lastAt = at;
	pipe.queue.push({ at, bytes: bytes.slice() });
	if (pipe.queue.length === 1) pump({ pipe });
}

type ClientData = { toBroker: Pipe; toClient: Pipe; upstream?: Socket };

for (const [listen, upstreamPort] of mapping) {
	const fault = faults.get(listen) as Fault;
	Bun.listen<ClientData>({
		hostname: "127.0.0.1",
		port: listen,
		socket: {
			open(client) {
				const data: ClientData = {
					toBroker: createPipe(),
					toClient: createPipe(),
				};
				client.data = data;
				data.toClient.target = client;
				void Bun.connect({
					hostname: "127.0.0.1",
					port: upstreamPort,
					socket: {
						open(upstream) {
							data.upstream = upstream;
							data.toBroker.target = upstream;
							pump({ pipe: data.toBroker });
						},
						data(_upstream, bytes) {
							enqueue({ pipe: data.toClient, fault, bytes });
						},
						drain() {
							pump({ pipe: data.toBroker });
						},
						close() {
							data.toClient.closed = true;
							client.end();
						},
						error() {
							client.end();
						},
					},
				}).catch(() => client.end());
			},
			data(client, bytes) {
				enqueue({ pipe: client.data.toBroker, fault, bytes });
			},
			drain(client) {
				pump({ pipe: client.data.toClient });
			},
			close(client) {
				client.data.toBroker.closed = true;
				client.data.upstream?.end();
			},
		},
	});
}

const control = Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.STALL_PROXY_CONTROL_PORT ?? 0),
	async fetch(request) {
		if (request.method !== "POST")
			return Response.json({ ok: true, brokers: [...faults.keys()] });
		const body = (await request.json()) as {
			listen: number;
			holdMs?: number;
			delayMs?: number;
			forMs?: number;
		};
		const fault = faults.get(body.listen);
		if (!fault) return new Response("unknown broker", { status: 404 });
		const now = Date.now();
		if (body.holdMs) fault.holdUntil = now + body.holdMs;
		if (body.delayMs) {
			fault.delayMs = body.delayMs;
			fault.delayUntil = now + (body.forMs ?? 0);
		}
		return Response.json({ at: now, listen: body.listen, ...fault });
	},
});
console.log(JSON.stringify({ event: "proxy.ready", control: control.port }));
