import { DEFAULT_IDEMPOTENCY_TABLE_NAME } from "@autumn/dynamodb";

export {
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "@autumn/dynamodb";

/** In prod the table is infra (created once via `bun dynamo setup`, TTL
 *  enabled on `expiresAt`); local emulators auto-create it on first use. */
export const getIdempotencyTableName = (): string =>
	process.env.DYNAMODB_IDEMPOTENCY_TABLE || DEFAULT_IDEMPOTENCY_TABLE_NAME;
