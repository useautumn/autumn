/** A ring's shared memory: a 64-byte header holding the two positions, then `capacity` bytes of frames. */
export type Ring = { sab: SharedArrayBuffer; capacity: number };

export type RingFrame = {
	type: number;
	/** Aliases the ring until `advance`; copy out anything kept. */
	bytes: Uint8Array;
	/** Where the payload starts in the writer's or reader's `view`. */
	offset: number;
	length: number;
};

/** The one thread that writes frames into a ring. */
export type RingWriter = {
	readonly bytes: Uint8Array;
	readonly view: DataView;
	/** The largest payload one frame can carry: half the ring, so it fits wherever the tail stands. */
	readonly maxFrameBytes: number;
	/** Reserves up to `maxLength` payload bytes; the payload offset, or -1 when the ring cannot take it now. */
	claim(params: { type: number; maxLength: number }): number;
	/** Publishes the claimed frame with its actual payload length (at most what was claimed). */
	publish(params: { length: number }): void;
	/** Makes published frames visible and wakes a sleeping reader; once per batch. */
	flush(): boolean;
	write(params: { type: number; payload: Uint8Array }): boolean;
};

/** The one thread that reads frames out of a ring. */
export type RingReader = {
	readonly bytes: Uint8Array;
	readonly view: DataView;
	hasWork(): boolean;
	/** The next frame, or null when empty; its bytes alias the ring until `advance`. */
	next(): RingFrame | null;
	advance(): void;
	/** Publishes the consumed position so the writer can reuse the space; once per batch. */
	release(): void;
};
