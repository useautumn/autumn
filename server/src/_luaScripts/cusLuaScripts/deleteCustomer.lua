-- deleteCustomer.lua
-- Atomically deletes a customer and all its associated entity caches
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customer_id
-- Returns: number of keys deleted

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]

-- Build versioned cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)
local basePattern = cacheKey .. "*"
local keysToDelete = {}

-- Scan for all keys matching the pattern
-- This includes the customer base key and ALL entity keys under it
local cursor = "0"
repeat
    local result = redis.call("SCAN", cursor, "MATCH", basePattern, "COUNT", 100)
    cursor = result[1]
    local keys = result[2]
    
    for _, key in ipairs(keys) do
        table.insert(keysToDelete, key)
    end
until cursor == "0"

-- Delete all keys in one atomic operation
local deletedCount = 0
if #keysToDelete > 0 then
    -- Redis DEL can handle multiple keys, but has argument limits
    -- So we batch delete in chunks of 1000
    local chunkSize = 1000
    for i = 1, #keysToDelete, chunkSize do
        local chunk = {}
        for j = i, math.min(i + chunkSize - 1, #keysToDelete) do
            table.insert(chunk, keysToDelete[j])
        end
        deletedCount = deletedCount + redis.call("DEL", unpack(chunk))
    end
end

return deletedCount

