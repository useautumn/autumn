/**
 * The one seam business code offers the pool: a request on an inline route decided now, synchronously.
 * Null means "answer through the ordinary fetch"; the pool never learns why.
 */
export type InlineHandler = (request: {
	/** Index into the pool's `inline.routes`. */
	route: number;
	body: Uint8Array;
}) => InlineReply | null;

export type InlineReply = {
	status: number;
	body: string | Uint8Array;
	partition: number;
	/** 0 goes out at once; above 0 waits for the partition's commit position to reach it. */
	heldUntilSeq: number;
};

/** Every held reply of `partition` in (`aboveSeq`, `lastSeq`] is answered with this, already rendered. */
export type HeldFailure = {
	partition: number;
	aboveSeq: number;
	lastSeq: number;
	status: number;
	body: string;
};
