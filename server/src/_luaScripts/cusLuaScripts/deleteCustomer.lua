-- deleteCustomer.lua
-- Atomically deletes a customer and all its associated entity caches
-- KEYS[1]: customer cache key pattern (e.g., "{org_id}:env:customer:customer_id")
-- Returns: number of keys deleted

local basePattern = KEYS[1] .. "*"
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

