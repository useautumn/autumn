import { DEFAULT_IDEMPOTENCY_TABLE_NAME } from "@autumn/dynamodb";

export {
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "@autumn/dynamodb";

export const getIdempotencyTableName = (): string =>
	process.env.DYNAMODB_IDEMPOTENCY_TABLE || DEFAULT_IDEMPOTENCY_TABLE_NAME;
