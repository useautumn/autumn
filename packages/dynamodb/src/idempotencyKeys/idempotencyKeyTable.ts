/** In prod the table is infra (created once, TTL enabled on `expiresAt`); emulators create it on first use. */
export const DEFAULT_IDEMPOTENCY_TABLE_NAME = "autumn-idempotency-keys";
export const IDEMPOTENCY_TABLE_PARTITION_KEY = "pk";
export const IDEMPOTENCY_TABLE_TTL_ATTRIBUTE = "expiresAt";
