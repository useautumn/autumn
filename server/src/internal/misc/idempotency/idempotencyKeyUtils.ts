import { ms } from "@autumn/shared";

export {
	buildIdempotencyStorageKey,
	hashIdempotencyKey,
	type IdempotencyClaimResult,
} from "@autumn/dynamodb";

export const IDEMPOTENCY_TTL_MS = ms.hours(24);
