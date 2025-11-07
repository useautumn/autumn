-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and feature HSETs
-- Merges master customer features with entity features
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: org_id (for building entity cache keys)
-- ARGV[2]: env (for building entity cache keys)
-- ARGV[3]: customer_id (for building entity cache keys)

-- Helper function to merge products array by product ID and normalized status
-- Groups products by key (product_id:normalized_status) and merges quantities
local function mergeProducts(productsArray)
    if not productsArray or #productsArray == 0 then
        return {}
    end
    
    -- Helper function to get product key for grouping
    local function getProductKey(product)
        local status = product.status
        -- Normalize status: "active" or "past_due" -> "active", otherwise use actual status
        if status == "active" or status == "past_due" then
            status = "active"
        end
        return product.id .. ":" .. status
    end
    
    local record = {}
    
    for _, curr in ipairs(productsArray) do
        local key = getProductKey(curr)
        local latest = record[key]
        
        local currStartedAt = curr.started_at
        
        -- Start with latest (or current if no latest exists), then override specific fields
        local mergedProduct = {}
        if latest then
            -- Copy all fields from latest first
            for k, v in pairs(latest) do
                mergedProduct[k] = v
            end
        else
            -- Copy all fields from current
            for k, v in pairs(curr) do
                mergedProduct[k] = v
            end
        end
        
        -- Apply merge logic for specific fields
        if latest then
            -- version: max(latest.version or 1, current.version or 1)
            local latestVersion = latest.version or 1
            local currVersion = curr.version or 1
            mergedProduct.version = math.max(latestVersion, currVersion)
            
            -- canceled_at: current.canceled_at if exists, else latest.canceled_at, else null
            if curr.canceled_at and curr.canceled_at ~= cjson.null and curr.canceled_at ~= nil then
                mergedProduct.canceled_at = curr.canceled_at
            elseif latest.canceled_at and latest.canceled_at ~= cjson.null and latest.canceled_at ~= nil then
                mergedProduct.canceled_at = latest.canceled_at
            else
                mergedProduct.canceled_at = cjson.null
            end
            
            -- started_at: latest.started_at ? min(latest.started_at, current.started_at) : current.started_at
            if latest.started_at then
                mergedProduct.started_at = math.min(latest.started_at, currStartedAt)
            else
                mergedProduct.started_at = currStartedAt
            end
            
            -- quantity: (latest.quantity or 0) + (current.quantity or 0)
            local latestQuantity = latest.quantity or 0
            local currQuantity = curr.quantity or 0
            mergedProduct.quantity = latestQuantity + currQuantity
        else
            -- First product in group, ensure defaults
            mergedProduct.version = curr.version or 1
            mergedProduct.canceled_at = curr.canceled_at or cjson.null
            mergedProduct.started_at = currStartedAt
            mergedProduct.quantity = curr.quantity or 0
        end
        
        record[key] = mergedProduct
    end
    
    -- Convert record back to array
    local mergedProducts = {}
    for _, product in pairs(record) do
        table.insert(mergedProducts, product)
    end
    
    return mergedProducts
end

local cacheKey = KEYS[1]
local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]

-- Use loadCusFeatures to get merged features (customer + entities)
local features = loadCusFeatures(cacheKey, orgId, env, customerId)
if not features then
    return nil -- Customer not in cache or partial eviction detected
end

-- Get base customer JSON for products and metadata
local baseJson = redis.call("GET", cacheKey)
if not baseJson then
    return nil
end

local baseCustomer = cjson.decode(baseJson)
local entityIds = baseCustomer._entityIds or {}

-- ============================================================================
-- MERGE ENTITY PRODUCTS INTO CUSTOMER PRODUCTS
-- ============================================================================

-- Build entity base data map for product access
local entityBaseData = {}
for _, entityId in ipairs(entityIds) do
    local entityCacheKey = "{" .. orgId .. "}:" .. env .. ":customer:" .. customerId .. ":entity:" .. entityId
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        entityBaseData[entityId] = cjson.decode(entityBaseJson)
    end
end

-- Collect all products: start with customer's products, then add all entity products
local allProducts = {}
if baseCustomer.products then
    for _, product in ipairs(baseCustomer.products) do
        table.insert(allProducts, product)
    end
end

-- Add products from each entity
for _, entityId in ipairs(entityIds) do
    local entityBase = entityBaseData[entityId]
    if entityBase and entityBase.products then
        for _, product in ipairs(entityBase.products) do
            table.insert(allProducts, product)
        end
    end
end

-- Merge products by product ID and normalized status
baseCustomer.products = mergeProducts(allProducts)

-- Build final customer object
baseCustomer._featureIds = nil -- Remove tracking field
baseCustomer._entityIds = nil -- Remove tracking field
baseCustomer.features = features

return cjson.encode(baseCustomer)
