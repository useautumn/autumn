-- cacheKeyUtils.lua
-- Shared cache key builders for customer and entity caches
-- Constants are replaced at load time

-- Cache TTL constant (replaced at load time)
local CACHE_TTL_SECONDS = {TTL_SECONDS}

-- Cache guard TTL constant in milliseconds (replaced at load time)
-- Used to prevent stale writes after cache deletion
local CACHE_GUARD_TTL_MS = {GUARD_TTL_MS}

-- Default cache customer version (replaced at load time)
local CACHE_CUSTOMER_VERSION = "{CUSTOMER_VERSION}"

-- Global override for cache version (set by main scripts like getCustomer.lua, getEntity.lua)
-- Initialize to nil; main scripts set this before calling cache key functions
local CACHE_CUSTOMER_VERSION_OVERRIDE = nil

-- Build customer cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId
-- Uses: CACHE_CUSTOMER_VERSION_OVERRIDE global (if set) > CACHE_CUSTOMER_VERSION default
local function buildCustomerCacheKey(orgId, env, customerId)
    local version = CACHE_CUSTOMER_VERSION_OVERRIDE or CACHE_CUSTOMER_VERSION
    return "{" .. orgId .. "}:" .. env .. ":customer:" .. version .. ":" .. customerId
end

-- Build cache guard key (used to prevent stale writes after deletion)
-- Returns: {orgId}:env:customer_guard:customerId
local function buildCacheGuardKey(orgId, env, customerId)
    return "{" .. orgId .. "}:" .. env .. ":customer_guard:" .. customerId
end

-- Build test cache delete guard key (used to prevent cache deletion during testing)
-- Returns: {orgId}:env:test_cache_delete_guard:customerId
local function buildTestCacheDeleteGuard(orgId, env, customerId)
    return "{" .. orgId .. "}:" .. env .. ":test_cache_delete_guard:" .. customerId
end

-- Build entity cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId:entity:entityId
-- Uses: CACHE_CUSTOMER_VERSION_OVERRIDE global (if set) > CACHE_CUSTOMER_VERSION default
local function buildEntityCacheKey(orgId, env, customerId, entityId)
    local version = CACHE_CUSTOMER_VERSION_OVERRIDE or CACHE_CUSTOMER_VERSION
    return "{" .. orgId .. "}:" .. env .. ":customer:" .. version .. ":" .. customerId .. ":entity:" .. entityId
end

-- Build balance cache key
-- Returns: {cacheKey}:balances:{featureId}
local function buildBalanceCacheKey(cacheKey, featureId)
    return cacheKey .. ":balances:" .. featureId
end

-- Build rollover cache key
-- Returns: {cacheKey}:balances:{featureId}:rollover:{index}
local function buildRolloverCacheKey(cacheKey, featureId, index)
    return cacheKey .. ":balances:" .. featureId .. ":rollover:" .. index
end

-- Build breakdown cache key
-- Returns: {cacheKey}:balances:{featureId}:breakdown:{index}
local function buildBreakdownCacheKey(cacheKey, featureId, index)
    return cacheKey .. ":balances:" .. featureId .. ":breakdown:" .. index
end

