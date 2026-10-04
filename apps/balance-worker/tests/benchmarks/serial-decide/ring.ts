/**
 * Single-producer single-consumer byte ring on a SharedArrayBuffer (Agrona's OneToOneRingBuffer shape).
 * Frames are `[u32 length][u8 type][payload]`; a frame that would straddle the end writes a padding
 * frame and wraps. Positions grow without bound; the index is the position masked by the capacity.
 *
 * Wake-ups go through a `Doorbell`: a producer rings it only when the consumer has declared itself
 * asleep, so a busy consumer costs the producer one atomic store per flush and no syscall.
 */
const HEADER_BYTES = 64;
const TAIL = 0;
const HEAD = 1;
const PADDING = 0xffffffff;
export const FRAME_HEADER = 5;

export type RingLayout = { sab: SharedArrayBuffer; capacity: number };

export function allocateRing({ capacity }: { capacity: number }): RingLayout {
	if ((capacity & (capacity - 1)) !== 0)
		throw new Error("ring capacity must be a power of two");
	return { sab: new SharedArrayBuffer(HEADER_BYTES + capacity), capacity };
}

export type RingFrame = {
	type: number;
	/** A view into the ring: valid until the next `advance`. */
	bytes: Uint8Array;
	/** Offset of the payload inside `view`. */
	offset: number;
	length: number;
};

/** A shared wake-up cell: producers ring it, one consumer sleeps on it. Several ringers are fine. */
export class Doorbell {
	readonly cells: Int32Array;
	constructor(sab?: SharedArrayBuffer) {
		this.cells = new Int32Array(sab ?? new SharedArrayBuffer(16));
	}
	get sab(): SharedArrayBuffer {
		return this.cells.buffer as SharedArrayBuffer;
	}
	/** Producer side: rings only if the consumer is asleep. Returns true when it rang. */
	ring(): boolean {
		if (Atomics.load(this.cells, 1) !== 1) return false;
		Atomics.add(this.cells, 0, 1);
		Atomics.notify(this.cells, 0);
		return true;
	}
	/** Consumer side: `hasWork` is re-checked after declaring sleep, so a publish between the last poll and
	 *  the wait is never missed (the producer sees SLEEPING=1 and rings, or we see its tail). */
	async sleep({
		hasWork,
		timeoutMs,
	}: {
		hasWork: () => boolean;
		timeoutMs: number;
	}): Promise<boolean> {
		const bell = Atomics.load(this.cells, 0);
		Atomics.store(this.cells, 1, 1);
		if (hasWork()) {
			Atomics.store(this.cells, 1, 0);
			return true;
		}
		const waited = Atomics.waitAsync(this.cells, 0, bell, timeoutMs);
		const outcome = waited.async ? await waited.value : waited.value;
		Atomics.store(this.cells, 1, 0);
		return outcome !== "timed-out";
	}
}

export class RingProducer {
	private readonly header: Int32Array;
	readonly payload: Uint8Array;
	readonly payloadView: DataView;
	private readonly mask: number;
	private readonly capacity: number;
	private tail = 0;
	private cachedHead = 0;
	private claimedAt = -1;
	readonly doorbell: Doorbell;

	constructor({ sab, capacity }: RingLayout, doorbell: Doorbell) {
		this.header = new Int32Array(sab, 0, HEADER_BYTES / 4);
		this.payload = new Uint8Array(sab, HEADER_BYTES, capacity);
		this.payloadView = new DataView(sab, HEADER_BYTES, capacity);
		this.mask = capacity - 1;
		this.capacity = capacity;
		this.tail = Atomics.load(this.header, TAIL) >>> 0;
		this.doorbell = doorbell;
	}

	private free(needed: number): boolean {
		if (this.capacity - (this.tail - this.cachedHead) >= needed) return true;
		this.cachedHead = Atomics.load(this.header, HEAD) >>> 0;
		return this.capacity - (this.tail - this.cachedHead) >= needed;
	}

	/** Reserves up to `maxLength` payload bytes; returns the payload offset, or -1 when the ring is full. */
	claim({ type, maxLength }: { type: number; maxLength: number }): number {
		const total = FRAME_HEADER + maxLength;
		if (total > this.capacity) throw new Error("frame larger than ring");
		let index = this.tail & this.mask;
		const toEnd = this.capacity - index;
		if (toEnd < total) {
			if (!this.free(toEnd + total)) return -1;
			if (toEnd >= 4) this.payloadView.setUint32(index, PADDING, true);
			this.tail += toEnd;
			index = 0;
		} else if (!this.free(total)) return -1;
		this.payload[index + 4] = type;
		this.claimedAt = index;
		return index + FRAME_HEADER;
	}

	/** Publishes the claimed frame with its actual payload length (≤ the claimed maximum). */
	publish({ length }: { length: number }): void {
		this.payloadView.setUint32(this.claimedAt, length, true);
		this.tail += FRAME_HEADER + length;
		this.claimedAt = -1;
	}

	/** Makes published frames visible and wakes a sleeping consumer. Once per batch. */
	flush(): boolean {
		Atomics.store(this.header, TAIL, this.tail | 0);
		return this.doorbell.ring();
	}

	write({ type, payload }: { type: number; payload: Uint8Array }): boolean {
		const at = this.claim({ type, maxLength: payload.length });
		if (at < 0) return false;
		this.payload.set(payload, at);
		this.publish({ length: payload.length });
		return true;
	}

	/** Bytes published but not yet consumed, for stats and back-pressure. */
	backlogBytes(): number {
		return (this.tail - (Atomics.load(this.header, HEAD) >>> 0)) >>> 0;
	}
}

export class RingConsumer {
	private readonly header: Int32Array;
	readonly payload: Uint8Array;
	readonly payloadView: DataView;
	private readonly mask: number;
	private readonly capacity: number;
	private head = 0;
	private cachedTail = 0;
	private pendingAdvance = 0;

	constructor({ sab, capacity }: RingLayout) {
		this.header = new Int32Array(sab, 0, HEADER_BYTES / 4);
		this.payload = new Uint8Array(sab, HEADER_BYTES, capacity);
		this.payloadView = new DataView(sab, HEADER_BYTES, capacity);
		this.mask = capacity - 1;
		this.capacity = capacity;
		this.head = Atomics.load(this.header, HEAD) >>> 0;
	}

	/** True when a published frame is waiting (reads the producer's tail). */
	hasWork(): boolean {
		if (this.head !== this.cachedTail) return true;
		this.cachedTail = Atomics.load(this.header, TAIL) >>> 0;
		return this.head !== this.cachedTail;
	}

	/** The next frame, or null when empty. The bytes alias the ring until `advance`. */
	next(): RingFrame | null {
		if (!this.hasWork()) return null;
		let index = this.head & this.mask;
		const toEnd = this.capacity - index;
		if (toEnd < FRAME_HEADER || this.payloadView.getUint32(index, true) === PADDING) {
			this.head += toEnd;
			index = 0;
			if (!this.hasWork()) return null;
		}
		const length = this.payloadView.getUint32(index, true);
		const type = this.payload[index + 4] as number;
		const offset = index + FRAME_HEADER;
		this.pendingAdvance = FRAME_HEADER + length;
		return { type, bytes: this.payload.subarray(offset, offset + length), offset, length };
	}

	advance(): void {
		this.head += this.pendingAdvance;
		this.pendingAdvance = 0;
	}

	/** Publishes the consumed position so the producer can reuse the space. Once per batch. */
	release(): void {
		Atomics.store(this.header, HEAD, this.head | 0);
	}

	backlogBytes(): number {
		return ((Atomics.load(this.header, TAIL) >>> 0) - this.head) >>> 0;
	}
}
