import { RingConsumer, RingProducer, type RingLayout } from "./ring.ts";

declare var self: Worker;

self.onmessage = async (event: MessageEvent) => {
	const { inbound, outbound, frames, inflight } = event.data as {
		inbound: RingLayout;
		outbound: RingLayout;
		frames: number;
		inflight: number;
	};
	const producer = new RingProducer(inbound);
	const consumer = new RingConsumer(outbound);
	const body = new Uint8Array(600).fill(66);
	let sent = 0;
	let acked = 0;
	let sleeps = 0;
	let rings = 0;
	const started = performance.now();
	const cpu0 = process.cpuUsage();
	while (acked < frames) {
		let did = 0;
		while (sent < frames && sent - acked < inflight) {
			const at = producer.claim({ type: 1, length: body.length });
			if (at < 0) break;
			producer.payloadView.setUint32(at, sent, true);
			producer.payload.set(body.subarray(4), at + 4);
			producer.publish({ length: body.length });
			sent++;
			did++;
		}
		if (did > 0 && producer.flush()) rings++;
		for (;;) {
			const frame = consumer.next();
			if (!frame) break;
			const seq = new DataView(frame.bytes.buffer, frame.bytes.byteOffset, 4).getUint32(0, true);
			if (seq !== acked) throw new Error(`reply gap ${seq} vs ${acked}`);
			acked++;
			consumer.advance();
			did++;
		}
		consumer.release();
		if (did === 0) {
			sleeps++;
			await consumer.sleep({ timeoutMs: 100 });
		}
	}
	const cpu = process.cpuUsage(cpu0);
	const elapsed = (performance.now() - started) / 1000;
	postMessage({
		frames,
		elapsed: Number(elapsed.toFixed(2)),
		perSec: Math.round(frames / elapsed),
		producerCpuUsPerFrame: Number(((cpu.user + cpu.system) / frames).toFixed(2)),
		sleeps,
		rings,
	});
};
