import type {
	IdempotencyClaimResult,
	IdempotencyKeyStore,
} from "@autumn/dynamodb";

/** An in-memory key store with the same owner rules as DynamoDB: the owner resumes, anyone else is a duplicate. */
export function createFakeIdempotencyKeys({
	outcome,
}: {
	outcome?: IdempotencyClaimResult;
} = {}) {
	const owners = new Map<string, string | undefined>();
	const released: string[] = [];
	const keys: IdempotencyKeyStore = {
		claim: async ({ storageKey, owner }) => {
			if (outcome) return outcome;
			if (!owners.has(storageKey)) {
				owners.set(storageKey, owner);
				return "claimed";
			}
			return owner !== undefined && owners.get(storageKey) === owner
				? "resumed"
				: "duplicate";
		},
		release: async ({ storageKey, owner }) => {
			if (owners.get(storageKey) !== owner) return;
			owners.delete(storageKey);
			released.push(storageKey);
		},
	};
	return { keys, owners, released };
}
