/**
 * One-producer one-consumer byte ring on a SharedArrayBuffer, the shape of Agrona's OneToOneRingBuffer.
 * Frames are `[u32 length][u8 type][payload]`; a frame that would straddle the end leaves a padding marker
 * and wraps. Positions grow without bound and index the ring through the capacity mask.
 */
const HEADER_BYTES = 64;
const TAIL = 0;
const HEAD = 1;
const PADDING = 0xffffffff;
export const FRAME_HEADER_BYTES = 5;

export type RingLayout = { sab: SharedArrayBuffer; capacity: number };

export function allocateRing({ capacity }: { capacity: number }): RingLayout {
	if ((capacity & (capacity - 1)) !== 0 || capacity < 4096)
		throw new RangeError(
			"ring capacity must be a power of two of at least 4 KiB",
		);
	return { sab: new SharedArrayBuffer(HEADER_BYTES + capacity), capacity };
}

export type RingFrame = {
	type: number;
	/** Aliases the ring until `advance`; copy out anything kept. */
	bytes: Uint8Array;
	offset: number;
	length: number;
};

/** A wake-up cell: any number of producers ring it, one consumer sleeps on it. */
export class Doorbell {
	readonly cells: Int32Array;

	constructor(sab?: SharedArrayBuffer) {
		this.cells = new Int32Array(sab ?? new SharedArrayBuffer(16));
	}

	get sab(): SharedArrayBuffer {
		return this.cells.buffer as SharedArrayBuffer;
	}

	/** Rings only when the consumer declared itself asleep, so a busy consumer costs producers one atomic load. */
	ring(): boolean {
		if (Atomics.load(this.cells, 1) !== 1) return false;
		Atomics.add(this.cells, 0, 1);
		Atomics.notify(this.cells, 0);
		return true;
	}

	/** `hasWork` is re-checked after declaring sleep: a publish between the last poll and the wait either
	 *  shows in that check or finds SLEEPING set and rings. */
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
		// Bun implements Atomics.waitAsync; the repo's TS lib predates it.
		const waited = (
			Atomics as unknown as {
				waitAsync(
					cells: Int32Array,
					index: number,
					value: number,
					timeout: number,
				): { async: boolean; value: Promise<string> | string };
			}
		).waitAsync(this.cells, 0, bell, timeoutMs);
		const outcome = waited.async ? await waited.value : waited.value;
		Atomics.store(this.cells, 1, 0);
		return outcome !== "timed-out";
	}
}

export class RingProducer {
	readonly payload: Uint8Array;
	readonly payloadView: DataView;
	private readonly header: Int32Array;
	private readonly mask: number;
	private readonly capacity: number;
	private tail: number;
	private cachedHead = 0;
	private claimedAt = -1;

	constructor(
		{ sab, capacity }: RingLayout,
		private readonly doorbell: Doorbell,
	) {
		this.header = new Int32Array(sab, 0, HEADER_BYTES / 4);
		this.payload = new Uint8Array(sab, HEADER_BYTES, capacity);
		this.payloadView = new DataView(sab, HEADER_BYTES, capacity);
		this.mask = capacity - 1;
		this.capacity = capacity;
		this.tail = Atomics.load(this.header, TAIL) >>> 0;
	}

	/** The largest payload one frame can carry. */
	get maxFrameBytes(): number {
		return this.capacity - FRAME_HEADER_BYTES;
	}

	private free(needed: number): boolean {
		if (this.capacity - (this.tail - this.cachedHead) >= needed) return true;
		this.cachedHead = Atomics.load(this.header, HEAD) >>> 0;
		return this.capacity - (this.tail - this.cachedHead) >= needed;
	}

	/** Reserves up to `maxLength` payload bytes; the payload offset, or -1 when the ring cannot take it now. */
	claim({ type, maxLength }: { type: number; maxLength: number }): number {
		const total = FRAME_HEADER_BYTES + maxLength;
		if (total > this.capacity)
			throw new RangeError("frame larger than the ring");
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
		return index + FRAME_HEADER_BYTES;
	}

	/** Publishes the claimed frame with its actual payload length (at most what was claimed). */
	publish({ length }: { length: number }): void {
		this.payloadView.setUint32(this.claimedAt, length, true);
		this.tail += FRAME_HEADER_BYTES + length;
		this.claimedAt = -1;
	}

	/** Makes published frames visible and wakes a sleeping consumer; once per batch. */
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
}

export class RingConsumer {
	readonly payload: Uint8Array;
	readonly payloadView: DataView;
	private readonly header: Int32Array;
	private readonly mask: number;
	private readonly capacity: number;
	private head: number;
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

	hasWork(): boolean {
		if (this.head !== this.cachedTail) return true;
		this.cachedTail = Atomics.load(this.header, TAIL) >>> 0;
		return this.head !== this.cachedTail;
	}

	/** The next frame, or null when empty; its bytes alias the ring until `advance`. */
	next(): RingFrame | null {
		if (!this.hasWork()) return null;
		let index = this.head & this.mask;
		const toEnd = this.capacity - index;
		if (
			toEnd < FRAME_HEADER_BYTES ||
			this.payloadView.getUint32(index, true) === PADDING
		) {
			this.head += toEnd;
			index = 0;
			if (!this.hasWork()) return null;
		}
		const length = this.payloadView.getUint32(index, true);
		const type = this.payload[index + 4] as number;
		const offset = index + FRAME_HEADER_BYTES;
		this.pendingAdvance = FRAME_HEADER_BYTES + length;
		return {
			type,
			bytes: this.payload.subarray(offset, offset + length),
			offset,
			length,
		};
	}

	advance(): void {
		this.head += this.pendingAdvance;
		this.pendingAdvance = 0;
	}

	/** Publishes the consumed position so the producer can reuse the space; once per batch. */
	release(): void {
		Atomics.store(this.header, HEAD, this.head | 0);
	}
}
