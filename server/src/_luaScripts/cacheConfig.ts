import { ApiVersion } from "@autumn/shared";

/**
 * Cache configuration constants
 * These values are injected into Lua scripts at load time for optimal performance
 */

/**
 * Customer cache version (applies to both customer and entity caches)
 * Increment this (change to a newer ApiVersion) when customer/entity cache structure changes
 * Old caches will be orphaned and expire after CACHE_TTL_SECONDS
 *
 * Format: customer:{version}:{customerId} or customer:{version}:{customerId}:entity:{entityId}
 */
export const CACHE_CUSTOMER_VERSION = ApiVersion.V1_2;

/**
 * Cache time-to-live in seconds (7 days)
 * All customer and entity caches will expire after this duration
 */
export const CACHE_TTL_SECONDS = 3 * 24 * 60 * 60; // 7 days = 604800 seconds
