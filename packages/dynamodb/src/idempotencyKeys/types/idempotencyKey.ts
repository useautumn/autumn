import type { DynamoClient } from "../../types/dynamoClient.js";

export type IdempotencyKeysContext = {
	dynamo: DynamoClient;
	tableName: string;
	logger?: { warn(message: string): void };
};

export type IdempotencyClaimResult =
	| "claimed"
	| "resumed"
	| "duplicate"
	| "unavailable";

export type IdempotencyClaim = {
	storageKey: string;
	ttlMs: number;
	owner?: string;
};

export type IdempotencyKeyStore = {
	claim(claim: IdempotencyClaim): Promise<IdempotencyClaimResult>;
	release(params: { storageKey: string; owner?: string }): Promise<void>;
};
