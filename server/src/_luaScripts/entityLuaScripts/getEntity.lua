-- getEntity.lua
-- Atomically retrieves an entity object from Redis, reconstructing from base JSON and feature HSETs
-- Merges entity features with customer features (unless skipCustomerMerge is true)
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customerId
-- ARGV[4]: entityId
-- ARGV[5]: skipCustomerMerge (optional, "true" to skip merging with customer)

-- Helper function to safely convert values to numbers for arithmetic
-- Returns the value if it's a number, otherwise returns 0
local function toNum(value)
    return type(value) == "number" and value or 0
end

-- Helper function to get product key for grouping (product_id:normalized_status)
local function getProductKey(product)
    local status = product.status
    -- Normalize status: "active" or "past_due" -> "active", otherwise use actual status
    if status == "active" or status == "past_due" then
        status = "active"
    end
    return product.id .. ":" .. status
end

-- Helper function to merge customer products into entity products
-- Adds customer products that don't already exist in entity products (by product key)
local function mergeCustomerProductsIntoEntity(entityProducts, customerProducts)
    if not customerProducts or #customerProducts == 0 then
        return entityProducts or {}
    end
    
    if not entityProducts then
        entityProducts = {}
    end
    
    -- Build a set of existing product keys in entity products
    local existingKeys = {}
    for _, product in ipairs(entityProducts) do
        local key = getProductKey(product)
        existingKeys[key] = true
    end
    
    -- Add customer products that don't exist in entity products
    local mergedProducts = {}
    
    -- First, add all entity products
    for _, product in ipairs(entityProducts) do
        table.insert(mergedProducts, product)
    end
    
    -- Then, add customer products that don't exist
    for _, customerProduct in ipairs(customerProducts) do
        local key = getProductKey(customerProduct)
        if not existingKeys[key] then
            table.insert(mergedProducts, customerProduct)
        end
    end
    
    return mergedProducts
end

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]
local entityId = ARGV[4]
local skipCustomerMerge = ARGV[5] == "true"

-- Build versioned entity cache key using shared utility
local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)

-- Get base entity JSON
local baseJson = redis.call("GET", entityCacheKey)
if not baseJson then
    return nil
end

local baseEntity = cjson.decode(baseJson)

-- Build customer cache key for feature loading
local customerCacheKey = buildCustomerCacheKey(orgId, env, customerId)

-- ============================================================================
-- LOAD FEATURES USING loadCusFeatures
-- ============================================================================
local mergedFeatures

if skipCustomerMerge then
    -- Load only entity's own features (no customer merging)
    -- We'll use loadCusFeatures with "__CUSTOMER_ONLY__" mode on the entity cache key
    -- This is a bit of a hack but works with the current structure
    mergedFeatures = loadCusFeatures(entityCacheKey, orgId, env, customerId, "__CUSTOMER_ONLY__")
else
    -- Load entity-level merged features (entity + customer)
    -- loadCusFeatures handles this when entityId is provided
    mergedFeatures = loadCusFeatures(customerCacheKey, orgId, env, customerId, entityId)
end

-- If features loading failed (partial eviction), return nil
if not mergedFeatures then
    return nil
end

-- ============================================================================
-- MERGE CUSTOMER PRODUCTS INTO ENTITY PRODUCTS
-- Skip if skipCustomerMerge is true
-- ============================================================================

-- Get entity products (start with entity's own products)
local entityProducts = baseEntity.products or {}

if not skipCustomerMerge then
    -- Get customer products
    local customerProducts = nil
    local customerBaseJson = redis.call("GET", customerCacheKey)
    if customerBaseJson then
        local customerBase = cjson.decode(customerBaseJson)
        customerProducts = customerBase.products
    end

    -- Merge customer products into entity products (only add if not exists)
    baseEntity.products = mergeCustomerProductsIntoEntity(entityProducts, customerProducts)
else
    -- No merging - just use entity's own products
    baseEntity.products = entityProducts
end

-- Build final entity object
baseEntity._featureIds = nil -- Remove tracking field
baseEntity.features = mergedFeatures

return cjson.encode(baseEntity)

