-- filterBalanceUtils.lua
-- Utilities for filtering balance breakdown items and calculating backend balances
-- Used by batchDeduction.lua for update balance operations that target specific entitlements
-- Note: Depends on toNum() from loadBalances.lua (loaded before this file)

-- ============================================================================
-- FILTER HELPERS (must be defined first - used by other functions)
-- ============================================================================

-- Check if a breakdown item has expired
-- @param item table - Breakdown item with optional expires_at field
-- @param nowMs number - Current time in milliseconds (Unix timestamp)
-- @return boolean - true if expired, false otherwise
local function isBreakdownExpired(item, nowMs)
    if not item.expires_at then
        return false
    end
    
    -- expires_at is null/cjson.null means no expiry
    if item.expires_at == cjson.null then
        return false
    end
    
    local expiresAt = tonumber(item.expires_at)
    if not expiresAt then
        return false
    end
    
    return expiresAt <= nowMs
end

-- Check if a breakdown item matches the given filters
-- @param item table - Breakdown item (or top-level balance treated as single item)
-- @param filters table|nil - Filter criteria { id?: string, interval?: string }
-- @param nowMs number|nil - Current time in milliseconds for expiry check (optional)
-- @return boolean
local function breakdownMatchesFilters(item, filters, nowMs)
    -- Check expiry first (if nowMs is provided)
    if nowMs and isBreakdownExpired(item, nowMs) then
        return false
    end
    
    if not filters then
        return true
    end
    
    -- Check id filter (breakdown.id = customer_entitlement_id)
    if filters.id and filters.id ~= "" then
        if item.id ~= filters.id then
            return false
        end
    end
    
    -- Check interval filter (breakdown.reset.interval)
    if filters.interval and filters.interval ~= "" then
        local hasReset = item.reset and type(item.reset) == "table" and item.reset ~= cjson.null
        local itemInterval = hasReset and item.reset.interval
        
        -- Special case: "one_off" filter matches both "one_off" string AND null/nil reset
        if filters.interval == "one_off" then
            local isOneOff = itemInterval == "one_off" 
                or not hasReset 
                or itemInterval == nil 
                or itemInterval == cjson.null
            if not isOneOff then
                return false
            end
        elseif itemInterval ~= filters.interval then
            return false
        end
    end
    
    return true
end

-- ============================================================================
-- BACKEND BALANCE HELPERS
-- ============================================================================

-- Calculate the "backend balance" for a breakdown item
-- Formula: current_balance - (purchased_balance - prepaid_quantity)
-- @param breakdown table - Breakdown item with current_balance, purchased_balance, prepaid_quantity
-- @return number - The backend balance
local function breakdownToBackendBalance(breakdown)
    local currentBalance = toNum(breakdown.current_balance)
    local purchasedBalance = toNum(breakdown.purchased_balance)
    local prepaidQuantity = toNum(breakdown.prepaid_quantity)
    
    return currentBalance - (purchasedBalance - prepaidQuantity)
end

-- Calculate the "backend balance" for a cusFeature (top-level, no breakdowns)
-- Formula: current_balance - (purchased_balance - prepaid_quantity)
-- Note: Top-level cusFeature doesn't have prepaid_quantity, only breakdown items do
-- @param cusFeature table - Balance object with current_balance, purchased_balance
-- @return number - The backend balance
local function cusFeatureToBackendBalance(cusFeature)
    local currentBalance = toNum(cusFeature.current_balance)
    local purchasedBalance = toNum(cusFeature.purchased_balance)
    -- Top-level doesn't have prepaid_quantity, assume 0
    local prepaidQuantity = 0
    
    return currentBalance - (purchasedBalance - prepaidQuantity)
end

-- Calculate the total "backend balance" for a balance object
-- Handles both breakdown and non-breakdown cases
-- @param balance table|nil - Balance object (with optional breakdown array)
-- @param filters table|nil - Filter criteria { id?: string, interval?: string }
-- @param nowMs number|nil - Current time in milliseconds for expiry check (optional)
-- @return number - The total backend balance (filtered if filters provided)
local function balanceToBackendBalance(balance, filters, nowMs)
    if not balance then
        return 0
    end
    
    local breakdowns = balance.breakdown
    local hasRealBreakdowns = breakdowns and #breakdowns > 0
    
    if not hasRealBreakdowns then
        -- No breakdowns: use top-level cusFeature calculation
        if breakdownMatchesFilters(balance, filters, nowMs) then
            return cusFeatureToBackendBalance(balance)
        end
        return 0
    end
    
    -- Sum backend balances across filtered breakdowns
    local totalBackendBalance = 0
    for _, breakdown in ipairs(breakdowns) do
        if breakdownMatchesFilters(breakdown, filters, nowMs) then
            totalBackendBalance = totalBackendBalance + breakdownToBackendBalance(breakdown)
        end
    end
    
    return totalBackendBalance
end

-- ============================================================================
-- MAIN FILTER FUNCTION
-- ============================================================================

-- Filter a balance's breakdown items and return the sum of matching current_balances
-- @param balance table|nil - Balance object (with optional breakdown array)
-- @param filters table - Filter criteria { id?: string, interval?: string }
-- @param nowMs number|nil - Current time in milliseconds for expiry check (optional)
-- @return table - { filteredBalance: number, filteredBreakdownIndices: array, matchedBreakdownIds: array }
local function loadFilteredBalance(balance, filters, nowMs)
    local result = {
        filteredBalance = 0,
        filteredBreakdownIndices = {},
        matchedBreakdownIds = {}
    }
    
    if not balance then
        return result
    end
    
    -- Get effective breakdowns (use array if exists, otherwise treat top-level as single item)
    local breakdowns = balance.breakdown
    local hasRealBreakdowns = breakdowns and #breakdowns > 0
    
    if not hasRealBreakdowns then
        -- Treat top-level balance as a virtual single-item breakdown
        breakdowns = {{ 
            id = balance.id,
            current_balance = balance.current_balance,
            reset = balance.reset,
            expires_at = balance.expires_at
        }}
    end
    
    -- Filter breakdowns and accumulate results
    for index, breakdown in ipairs(breakdowns) do
        if breakdownMatchesFilters(breakdown, filters, nowMs) then
            result.filteredBalance = result.filteredBalance + toNum(breakdown.current_balance)
            
            -- Only track indices for real breakdowns (not virtual single-item)
            if hasRealBreakdowns then
                table.insert(result.filteredBreakdownIndices, index - 1) -- 0-based for Redis
            end
            
            if breakdown.id then
                table.insert(result.matchedBreakdownIds, breakdown.id)
            end
        end
    end
    
    return result
end
