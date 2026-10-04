/**
 * Hot requests between an I/O worker and the sequencer (serial-decide arm D). The TypeScript types below are
 * the main-thread decider's contract; the frames are the pool's wire format.
 *
 *  HOT      io → main  [u32 reqId][u8 kind][u32 budgetMs][f64 deadlineAt][u32 metaLen][meta json][body]
 *                      kind: 1 = /v1/track, 2 = /v1/track-batch, 3 = /v1/check. budgetMs is the request's
 *                      x-request-budget-ms (0 = none); deadlineAt is arrival + budget in epoch ms (0 = none).
 *                      meta is the classic REQ meta { m, u, h }, so a request the decider declines is rebuilt
 *                      exactly as a REQ would be; the body is the request's JSON as received.
 *  HOT_RES  main → io  [u32 reqId][u16 status][u16 partition][f64 seq][u32 metaLen][meta json][body]
 *                      seq 0 = release now; seq > 0 = hold until commitPos[partition] ≥ seq.
 *  FAIL     main → io  [u16 partition][f64 aboveSeq][f64 lastSeq][u16 status][body]
 *                      every held reply of that partition with aboveSeq < seq ≤ lastSeq is answered with the
 *                      status and the JSON body; replies outside the range stay held for the position.
 *
 * `commitPos` is one BigInt64 per partition index on a SharedArrayBuffer: the main thread stores each
 * partition's latest acknowledged seq there and rings every worker's result bell; a worker releases held
 * replies in seq order. Sequence numbers are f64 on the wire and 64-bit in the cells, so they never wrap, and
 * the board numbers a partition across its writers, so a rebuilt writer never reuses a held reply's number.
 * HOT_RES and FAIL frames reach a worker in the order the main thread produced them, and a reply the ring
 * cannot carry is held on the main thread instead, so a FAIL never overtakes a reply it covers. The cell can
 * overtake a FAIL still queued behind a full ring, so the board counts failures per partition in shared memory
 * and a worker releases nothing on a partition until it has read as many FAIL frames as were published.
 */
export const HOT_KIND = { TRACK: 1, TRACK_BATCH: 2, CHECK: 3 } as const;
export type HotKind = (typeof HOT_KIND)[keyof typeof HOT_KIND];

export const HOT_HEADER_BYTES = 21;
export const HOT_RES_HEADER_BYTES = 20;
export const FAIL_HEADER_BYTES = 20;

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
 * What the sequencer offers the pool: a synchronous outcome for a hot request, or `null` when the request is
 * not eligible (not owned here, subject not resident or not current, a lock, a customer with a classic-path
 * command in flight), in which case the pool answers it through the ordinary fetch path. Synchronous on
 * purpose: a reply produced after its partition failed would be held on a number the log already gave up.
 */
/** What the decider answered and declined since the last drain; batch fallbacks are counted by reason. */
export type HotDeciderStats = {
	tracks: number;
	checks: number;
	trackBatches: number;
	batchItems: number;
	fallbackTracks: number;
	fallbackChecks: number;
	fallbackBatches: Record<string, number>;
};

export type HotDecider = {
	decide(request: HotRequest): HotOutcome | null;
	/** Counts since the last call; the event-loop report drains it once per window. */
	drainStats?(): HotDeciderStats;
	/** Partition count, so the pool can size the position cells. */
	partitionCount: number;
};

export const HOT_PATHS: Record<string, HotKind> = {
	"/v1/track": HOT_KIND.TRACK,
	"/v1/track-batch": HOT_KIND.TRACK_BATCH,
	"/v1/check": HOT_KIND.CHECK,
};
