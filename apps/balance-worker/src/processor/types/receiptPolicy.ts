/** How long a receipt deduplicates retries of the same command id, and the clock that stamps it. */
export type ReceiptPolicy = {
	retentionMs: number;
	now(): number;
};
