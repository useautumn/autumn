/** Fixed cache-entry settings, shared by the writer (herald) and every reader (autumn-js). */

/** Bumping this moves every key to a new prefix, so old-shaped values are never read. */
export const BYOC_CACHE_SCHEMA_VERSION = 1;
/** The API version `data` is rendered at; must equal ApiVersion.V2_4 (asserted in tests). */
export const BYOC_CACHE_API_VERSION = "2.4.0";
/** alien's KV value limit on every cloud (DynamoDB itself allows 400 KB). */
export const BYOC_CACHE_MAX_ENTRY_BYTES = 24_576;
