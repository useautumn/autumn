/**
 * One-writer one-reader byte ring on a SharedArrayBuffer, the shape of Agrona's OneToOneRingBuffer.
 * Frames are `[u32 length][u8 type][payload]`; a frame that would straddle the end leaves a padding marker
 * and wraps. Positions are u32, as the shared header stores them: every step and distance is taken mod 2^32.
 */
import type { Ring, RingFrame, RingReader, RingWriter } from "./types/ring.js";
import type { RingSignal } from "./types/ringSignal.js";

const HEADER_BYTES = 64;
type WaitAsync = (
	cells: Int32Array,
	index: number,
	value: number,
	timeout?: number,
) => { async: boolean; value: Promise<string> | string };
// Bun implements Atomics.waitAsync; the repo's TS lib predates it.
const waitAsync = (Atomics as unknown as { waitAsync: WaitAsync }).waitAsync;
const TAIL = 0;
const HEAD = 1;
const PADDING = 0xffffffff;
const FRAME_HEADER_BYTES = 5;

export const createRing = ({ capacity }: { capacity: number }): Ring => {
	if ((capacity & (capacity - 1)) !== 0 || capacity < 4096)
		throw new RangeError(
			"ring capacity must be a power of two of at least 4 KiB",
		);
	return { sab: new SharedArrayBuffer(HEADER_BYTES + capacity), capacity };
};

export const createRingWriter = ({
	ring,
	signal,
}: {
	ring: Ring;
	signal: RingSignal;
}): RingWriter => {
	const header = new Int32Array(ring.sab, 0, HEADER_BYTES / 4);
	const bytes = new Uint8Array(ring.sab, HEADER_BYTES, ring.capacity);
	const view = new DataView(ring.sab, HEADER_BYTES, ring.capacity);
	const { capacity } = ring;
	const mask = capacity - 1;
	// Above half the ring a frame can fit neither before the end nor after a wrap, wherever the tail is.
	const maxFrameBytes = capacity / 2 - FRAME_HEADER_BYTES;
	let tail = Atomics.load(header, TAIL) >>> 0;
	let cachedHead = Atomics.load(header, HEAD) >>> 0;
	let claimedAt = -1;

	function free(needed: number): boolean {
		if (capacity - ((tail - cachedHead) >>> 0) >= needed) return true;
		cachedHead = Atomics.load(header, HEAD) >>> 0;
		return capacity - ((tail - cachedHead) >>> 0) >= needed;
	}

	function claim({
		type,
		maxLength,
	}: {
		type: number;
		maxLength: number;
	}): number {
		if (maxLength > maxFrameBytes)
			throw new RangeError("frame larger than half the ring");
		const total = FRAME_HEADER_BYTES + maxLength;
		let index = tail & mask;
		const toEnd = capacity - index;
		if (toEnd < total) {
			if (!free(toEnd + total)) return -1;
			if (toEnd >= 4) view.setUint32(index, PADDING, true);
			tail = (tail + toEnd) >>> 0;
			index = 0;
		} else if (!free(total)) return -1;
		bytes[index + 4] = type;
		claimedAt = index;
		return index + FRAME_HEADER_BYTES;
	}

	function publish({ length }: { length: number }): void {
		view.setUint32(claimedAt, length, true);
		tail = (tail + FRAME_HEADER_BYTES + length) >>> 0;
		claimedAt = -1;
	}

	/** Resolves once the reader has freed `maxLength` payload bytes; the reader's release wakes it. */
	async function waitForRoom({
		maxLength,
	}: {
		maxLength: number;
	}): Promise<void> {
		const needed = 2 * (FRAME_HEADER_BYTES + maxLength);
		for (;;) {
			const head = Atomics.load(header, HEAD);
			cachedHead = head >>> 0;
			if (capacity - ((tail - cachedHead) >>> 0) >= needed) return;
			const waited = waitAsync(header, HEAD, head);
			if (waited.async) await waited.value;
		}
	}

	function flush(): boolean {
		Atomics.store(header, TAIL, tail | 0);
		return signal.wake();
	}

	function write({
		type,
		payload,
	}: {
		type: number;
		payload: Uint8Array;
	}): boolean {
		const at = claim({ type, maxLength: payload.length });
		if (at < 0) return false;
		bytes.set(payload, at);
		publish({ length: payload.length });
		return true;
	}

	return {
		bytes,
		view,
		maxFrameBytes,
		claim,
		publish,
		flush,
		write,
		waitForRoom,
	};
};

export const createRingReader = ({ ring }: { ring: Ring }): RingReader => {
	const header = new Int32Array(ring.sab, 0, HEADER_BYTES / 4);
	const bytes = new Uint8Array(ring.sab, HEADER_BYTES, ring.capacity);
	const view = new DataView(ring.sab, HEADER_BYTES, ring.capacity);
	const { capacity } = ring;
	const mask = capacity - 1;
	let head = Atomics.load(header, HEAD) >>> 0;
	let cachedTail = head;
	let pendingAdvance = 0;

	function hasWork(): boolean {
		if (head !== cachedTail) return true;
		cachedTail = Atomics.load(header, TAIL) >>> 0;
		return head !== cachedTail;
	}

	function next(): RingFrame | null {
		if (!hasWork()) return null;
		let index = head & mask;
		const toEnd = capacity - index;
		if (toEnd < FRAME_HEADER_BYTES || view.getUint32(index, true) === PADDING) {
			head = (head + toEnd) >>> 0;
			index = 0;
			if (!hasWork()) return null;
		}
		const length = view.getUint32(index, true);
		const type = bytes[index + 4] as number;
		const offset = index + FRAME_HEADER_BYTES;
		pendingAdvance = FRAME_HEADER_BYTES + length;
		return {
			type,
			bytes: bytes.subarray(offset, offset + length),
			offset,
			length,
		};
	}

	function advance(): void {
		head = (head + pendingAdvance) >>> 0;
		pendingAdvance = 0;
	}

	function release(): void {
		Atomics.store(header, HEAD, head | 0);
		Atomics.notify(header, HEAD);
	}

	return { bytes, view, hasWork, next, advance, release };
};
