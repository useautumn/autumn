/**
 * FullCustomer cache configuration
 * Separate from ApiCustomer cache to allow independent versioning
 */

export const FULL_CUSTOMER_CACHE_VERSION = "1.0.0";

/**
 * Cache time-to-live in seconds (3 days)
 */
export const FULL_CUSTOMER_CACHE_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * Cache guard TTL in seconds
 * When cache is deleted, a guard key is set to prevent stale writes
 */
export const FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS = 1;

/**
 * Build the cache key for a FullCustomer
 */
export const buildFullCustomerCacheKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return `{${orgId}}:${env}:fullcustomer:${FULL_CUSTOMER_CACHE_VERSION}:${customerId}`;
};

/**
 * Build the cache guard key (prevents stale writes after deletion)
 */
export const buildFullCustomerCacheGuardKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return `{${orgId}}:${env}:fullcustomer:guard:${customerId}`;
};
