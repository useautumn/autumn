export type ReceiptPolicy = {
	retentionMs: number;
	now(): number;
};
