-- cacheKeyUtils.lua
-- Shared cache key builders for customer and entity caches
-- Version placeholder {CUSTOMER_VERSION} is replaced at load time

-- Cache TTL constant (replaced at load time)
local CACHE_TTL_SECONDS = {TTL_SECONDS}

-- Build customer cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId
local function buildCustomerCacheKey(orgId, env, customerId)
    return "{" .. orgId .. "}:" .. env .. ":customer:{CUSTOMER_VERSION}:" .. customerId
end

-- Build entity cache key with version
-- Returns: {orgId}:env:customer:{version}:customerId:entity:entityId
local function buildEntityCacheKey(orgId, env, customerId, entityId)
    return "{" .. orgId .. "}:" .. env .. ":customer:{CUSTOMER_VERSION}:" .. customerId .. ":entity:" .. entityId
end

