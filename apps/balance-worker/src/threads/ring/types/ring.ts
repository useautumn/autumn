export type Ring = { sab: SharedArrayBuffer; capacity: number };

export type RingFrame = {
	type: number;
	bytes: Uint8Array;
	offset: number;
	length: number;
};

export type RingWriter = {
	readonly bytes: Uint8Array;
	readonly view: DataView;
	readonly maxFrameBytes: number;
	claim(params: { type: number; maxLength: number }): number;
	publish(params: { length: number }): void;
	flush(): boolean;
	write(params: { type: number; payload: Uint8Array }): boolean;
	waitForRoom(params: { maxLength: number }): Promise<void>;
};

export type RingReader = {
	readonly bytes: Uint8Array;
	readonly view: DataView;
	hasWork(): boolean;
	next(): RingFrame | null;
	advance(): void;
	release(): void;
};
