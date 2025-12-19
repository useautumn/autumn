-- cacheKeyUtils.lua
-- Shared cache key builders for customer and entity caches
-- Version placeholder {CUSTOMER_VERSION} is replaced at load time

-- Cache TTL constant (replaced at load time)
local CACHE_TTL_SECONDS = {TTL_SECONDS}

-- Cache guard TTL constant in milliseconds (replaced at load time)
-- Used to prevent stale writes after cache deletion
local CACHE_GUARD_TTL_MS = {GUARD_TTL_MS}

-- Build customer cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId
local function buildCustomerCacheKey(orgId, env, customerId)
    return "{" .. orgId .. "}:" .. env .. ":customer:{CUSTOMER_VERSION}:" .. customerId
end

-- Build cache guard key (used to prevent stale writes after deletion)
-- Returns: {orgId}:env:customer_guard:customerId
local function buildCacheGuardKey(orgId, env, customerId)
    return "{" .. orgId .. "}:" .. env .. ":customer_guard:" .. customerId
end

-- Build entity cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId:entity:entityId
local function buildEntityCacheKey(orgId, env, customerId, entityId)
    return "{" .. orgId .. "}:" .. env .. ":customer:{CUSTOMER_VERSION}:" .. customerId .. ":entity:" .. entityId
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

