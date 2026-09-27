import type { DynamoClient } from "../../types/dynamoClient.js";

export type IdempotencyKeysContext = {
	dynamo: DynamoClient;
	tableName: string;
	logger?: { warn(message: string): void };
};

/**
 * "claimed" is a fresh claim; "resumed" is the same owner claiming again, its expiry untouched;
 * "duplicate" is someone else's live claim; "unavailable" is the store not answering, which fails open.
 */
export type IdempotencyClaimResult =
	| "claimed"
	| "resumed"
	| "duplicate"
	| "unavailable";

export type IdempotencyClaim = {
	storageKey: string;
	ttlMs: number;
	/** Who may claim again and release: a queued item that can be redelivered names itself. */
	owner?: string;
};

/** The store bound to one table, so callers claim and release without carrying the context. */
export type IdempotencyKeyStore = {
	claim(claim: IdempotencyClaim): Promise<IdempotencyClaimResult>;
	release(params: { storageKey: string; owner?: string }): Promise<void>;
};
