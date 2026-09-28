/** In prod the table is infra (created once via `bun dynamo setup`, TTL
 *  enabled on `expiresAt`); local emulators auto-create it on first use. */
export const getIdempotencyTableName = (): string =>
	process.env.DYNAMODB_IDEMPOTENCY_TABLE || "autumn-idempotency-keys";

export const IDEMPOTENCY_TABLE_PARTITION_KEY = "pk";

export const IDEMPOTENCY_TABLE_TTL_ATTRIBUTE = "expiresAt";
