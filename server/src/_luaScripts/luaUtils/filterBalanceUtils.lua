-- filterBalanceUtils.lua
-- Utilities for filtering balance breakdown items
-- Used by batchDeduction.lua for update balance operations that target specific entitlements
-- Note: Depends on toNum() from loadBalances.lua (loaded before this file)

-- ============================================================================
-- FILTER HELPERS
-- ============================================================================

-- Check if a breakdown item matches the given filters
-- Parameters:
--   item: Breakdown item (or top-level balance treated as single item)
--   filters: { id?: string, interval?: string }
-- Returns: boolean
local function breakdownMatchesFilters(item, filters)
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
        local itemInterval = item.reset and type(item.reset) == "table" and item.reset.interval
        if itemInterval ~= filters.interval then
            return false
        end
    end
    
    return true
end

-- ============================================================================
-- MAIN FILTER FUNCTION
-- ============================================================================

-- Filter a balance's breakdown items and return the sum of matching current_balances
-- Used for update balance operations that target specific entitlements
-- Parameters:
--   balance: Balance object (with optional breakdown array)
--   filters: Filter criteria { id?: string, interval?: string }
--     - id: Match breakdown.id (customer_entitlement_id)
--     - interval: Match breakdown.reset.interval (e.g., "month", "week")
-- Returns: { filteredBalance: number, filteredBreakdownIndices: array, matchedBreakdownIds: array }
--   - filteredBalance: Sum of current_balance from filtered breakdown items
--   - filteredBreakdownIndices: Array of indices (0-based) of matched breakdown items
--   - matchedBreakdownIds: Array of breakdown.id values that matched the filter
local function loadFilteredBalance(balance, filters)
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
            reset = balance.reset
        }}
    end
    
    -- Filter breakdowns and accumulate results
    for index, breakdown in ipairs(breakdowns) do
        if breakdownMatchesFilters(breakdown, filters) then
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

