/**
 * Hot requests between an I/O worker and the sequencer (serial-decide arm D). Frozen on day 1 of the port.
 *
 *  HOT  io → main   [u32 reqId][u8 kind][u32 budgetMs][f64 deadlineAt][body bytes]
 *                   kind: 1 = /v1/track, 2 = /v1/track-batch, 3 = /v1/check. budgetMs 0 = none; deadlineAt 0 = none.
 *                   The body is the request's JSON exactly as received; the sequencer parses it.
 *  RES  main → io   [u32 reqId][u16 status][u16 partition][u32 seq][u32 metaLen][meta json][body]
 *                   seq 0 = release now; seq > 0 = hold until commitPos[partition] ≥ seq.
 *  FAIL main → io   [u16 partition][u32 aboveSeq][u16 status][u32 bodyLen][body]
 *                   every held reply of that partition with seq > aboveSeq is answered with status/body.
 *  DROP io → main   [u8 kind]  a request shed past its deadline on the I/O thread; counted, never decided.
 *
 * `commitPos` is one Int32 per partition index on a SharedArrayBuffer: the sequencer stores the latest
 * acknowledged seq there and rings the worker's result bell; the worker releases held replies in seq order.
 */
export const HOT_KIND = { TRACK: 1, TRACK_BATCH: 2, CHECK: 3 } as const;
export type HotKind = (typeof HOT_KIND)[keyof typeof HOT_KIND];

export const HOT_HEADER_BYTES = 17;
export const HOT_RES_HEADER_BYTES = 16;
export const FAIL_HEADER_BYTES = 12;

export type HotRequest = {
	kind: HotKind;
	/** The raw JSON body; aliases nothing, safe to keep. */
	body: Uint8Array;
	budgetMs?: number;
	deadlineAt?: number;
};

export type HotOutcome = {
	status: number;
	headers?: [string, string][];
	body: Uint8Array | string;
	partition: number;
	/** 0 when the reply may go out at once (checks, errors, replies the classic path already committed). */
	seq: number;
};

/**
 * What the sequencer offers the pool: a synchronous or promised outcome for a hot request, or `null` when
 * the request is not eligible (not owned here, subject not resident or not current, a lock, a customer with a
 * classic-path command in flight), in which case the pool answers it through the ordinary fetch path.
 */
export type HotDecider = {
	decide(request: HotRequest): HotOutcome | Promise<HotOutcome> | null;
	/** Partition count, so the pool can size the position cells. */
	partitionCount: number;
};

export type PositionCells = {
	/** Int32 per partition index; the sequencer's latest acknowledged seq. */
	commitPos: SharedArrayBuffer;
};

export const HOT_PATHS: Record<string, HotKind> = {
	"/v1/track": HOT_KIND.TRACK,
	"/v1/track-batch": HOT_KIND.TRACK_BATCH,
	"/v1/check": HOT_KIND.CHECK,
};
