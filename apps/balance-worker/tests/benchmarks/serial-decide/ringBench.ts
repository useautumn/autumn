// Ring self-test + micro-benchmark: a producer worker streams numbered 600 B frames, the consumer (this
// thread) echoes 3.5 KB frames back; both sides verify sequence numbers. Reports frames/s and µs/frame.
import { allocateRing, RingConsumer, RingProducer } from "./ring.ts";

const CAP = 1 << 22;
const inbound = allocateRing({ capacity: CAP });
const outbound = allocateRing({ capacity: CAP });
const frames = Number(process.argv[2] ?? 2_000_000);
const inflight = Number(process.argv[3] ?? 64);

const worker = new Worker(new URL("./ringBench.worker.ts", import.meta.url).href);
worker.postMessage({ inbound, outbound, frames, inflight });

const consumer = new RingConsumer(inbound);
const producer = new RingProducer(outbound);
const reply = new Uint8Array(3500).fill(65);
let received = 0;
let expect = 0;
const started = performance.now();
let sleeps = 0;
for (;;) {
	let n = 0;
	for (;;) {
		const frame = consumer.next();
		if (!frame) break;
		const seq = new DataView(frame.bytes.buffer, frame.bytes.byteOffset, 4).getUint32(0, true);
		if (seq !== expect) throw new Error(`gap: got ${seq} expected ${expect}`);
		expect++;
		consumer.advance();
		const at = producer.claim({ type: 2, length: reply.length });
		if (at < 0) throw new Error("outbound full");
		producer.payloadView.setUint32(at, seq, true);
		producer.payload.set(reply.subarray(4), at + 4);
		producer.publish({ length: reply.length });
		n++;
		received++;
	}
	if (n > 0) {
		consumer.release();
		producer.flush();
	}
	if (received >= frames) break;
	if (n === 0) {
		sleeps++;
		await consumer.sleep({ timeoutMs: 100 });
	}
}
const elapsed = (performance.now() - started) / 1000;
await new Promise<void>((resolve) => {
	worker.onmessage = (event) => {
		console.log("producer:", JSON.stringify(event.data));
		resolve();
	};
});
console.log(
	`consumer: ${frames} frames in ${elapsed.toFixed(2)} s = ${(frames / elapsed).toFixed(0)}/s, ${((elapsed * 1e6) / frames).toFixed(2)} µs/frame wall, sleeps ${sleeps}`,
);
worker.terminate();
