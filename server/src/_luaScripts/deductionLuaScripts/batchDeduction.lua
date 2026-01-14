-- batchDeduction.lua
-- Atomically processes a batch of track requests for a customer
-- Each request can deduct from multiple features
--
-- Error codes:
--   CUSTOMER_NOT_FOUND: Customer not in cache
--   INSUFFICIENT_BALANCE: Overage behavior is "reject" and balance insufficient
--   PAID_ALLOCATED: Feature is continuous use with overage (should use Postgres)
--
-- ARGV[1]: JSON array of requests:
--   [
--     {
--       featureDeductions: [{ featureId: "credits", amount: 10 }, ...],
--       overageBehavior: "cap" | "reject" | "allow",
--         - "cap": Deduct from current_balance, then overage (respects overage_allowed and max_purchase)
--         - "reject": Same as cap, but fails if insufficient balance
--         - "allow": Bypass all restrictions - overage_allowed=true for all, no max_purchase cap, no granted_balance cap for refunds
--       syncMode: boolean (optional) - If true, sync cache to targetBalance instead of deducting
--       targetBalance: number (optional) - Target balance for sync mode (per feature)
--       entityId: string (optional) - Entity ID for entity-level tracking
--       filters: {                  (optional) - Filter which breakdown items to consider
--         id: string,               - Match breakdown.id (customer_entitlement_id)
--         interval: string          - Match breakdown.reset.interval (e.g., "month", "week")
--       }
--     },
--     ...
--   ]
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id
-- ARGV[5]: adjust_granted_balance (optional, "true" to decrement granted_balance instead of incrementing usage)

local requestsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local adjustGrantedBalance = ARGV[5] == "true"

-- Build versioned customer cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)

-- Parse requests
local requests = cjson.decode(requestsJson)

-- Get current time in milliseconds for expiry checks
local nowMs = redis.call("TIME")
nowMs = tonumber(nowMs[1]) * 1000 + math.floor(tonumber(nowMs[2]) / 1000)

-- Check if customer exists
local customerExists = redis.call("EXISTS", cacheKey)
if customerExists == 0 then
    -- For sync mode requests, skip silently (cache will be populated lazily)
    local allSyncMode = true
    for _, request in ipairs(requests) do
        if not request.syncMode then
            allSyncMode = false
            break
        end
    end
    
    if allSyncMode then
        -- For sync mode, if customer doesn't exist in cache, we need to fallback to Postgres
        -- because we can't calculate the delta without knowing the current balance
        return cjson.encode({
            success = false,
            error = "CUSTOMER_NOT_FOUND",
            results = {}
        })
    end
    
    -- At least one regular deduction - return error
    return cjson.encode({
        success = false,
        error = "CUSTOMER_NOT_FOUND",
        results = {}
    })
end

-- ============================================================================
-- GLOBAL STATE
-- ============================================================================

-- Global delta accumulator: { [redisKey][field] = delta }
local keyDeltas = {}

-- Track which entities were modified (set: { [entityId] = true })
local changedEntityIds = {}

-- Track if customer (base customer, not entity) was modified
local customerChanged = false

-- Track which featureIds were changed (for reloading balances)
-- { [featureId] = true } for customer-level changes
local changedCustomerFeatureIds = {}

-- Track which entity featureIds were changed: { [entityId] = { [featureId] = true } }
local changedEntityFeatureIds = {}

-- Track which breakdown.id (customer_entitlement_id) values were modified across all requests
-- Used for targeted Postgres sync after Redis update
local allModifiedBreakdownIds = {}

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Helper: Add delta to accumulator
local function addDelta(key, field, delta)
    if not keyDeltas[key] then
        keyDeltas[key] = {}
    end
    keyDeltas[key][field] = (keyDeltas[key][field] or 0) + delta
end


-- ============================================================================
-- VALIDATION
-- ============================================================================

-- No validation function needed - we try deduction and check remaining

-- ============================================================================
-- CORE DEDUCTION LOGIC
-- ============================================================================

-- Deduct from rollover balances
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct
-- Returns: { remaining: number }
local function deductFromRollovers(ctx, target, entityId, cusFeature, amount)
    local remaining = amount
    
    -- Deduct from each rollover
    for index, rollover in ipairs(cusFeature.rollovers or {}) do
        if remaining <= 0 then break end
        
        local rolloverBalance = rollover.balance or 0
        if rolloverBalance > 0 then
            local toDeduct = math.min(remaining, rolloverBalance)
            
            -- Record deduction using accumulator
            recordRolloverDeduction(ctx, target, entityId, cusFeature, rollover, index, toDeduct)
            
            remaining = remaining - toDeduct
        end
    end
    
    return { remaining = remaining }
end

-- Deduct from current_balance (first pass - only deducts from positive balances)
-- current_balance can NEVER go below 0
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct (can be negative for refunds)
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
--   overageBehavior: "cap", "reject", or "allow"
-- Returns: { remaining: number }
local function deductFromCurrentBalance(ctx, target, entityId, cusFeature, amount, filters, overageBehavior)
    local remaining = amount
    
    -- If cusFeature has breakdowns, deduct from breakdown current_balances
    if cusFeature.breakdown and #cusFeature.breakdown > 0 then
        for index, breakdown in ipairs(cusFeature.breakdown) do
            if remaining == 0 then break end
            
            -- Check if this breakdown matches the filters (and is not expired)
            if breakdownMatchesFilters(breakdown, filters, nowMs) then
                local breakdownCurrentBalance = breakdown.current_balance or 0
                -- For refunds (negative amount), always apply. For deductions, only if balance > 0
                if remaining < 0 or breakdownCurrentBalance > 0 then
                    local toDeduct
                    if remaining < 0 then
                        if overageBehavior == "allow" then
                            -- "allow" mode: no cap, add full refund amount
                            toDeduct = remaining  -- negative value, will be subtracted (adding to balance)
                        else
                            -- Normal mode: Cap at granted_balance
                            -- We want to add (-remaining) to current_balance
                            -- But we can add at most (granted_balance - current_balance)
                            local grantedBalance = breakdown.granted_balance or 0
                            local maxAddable = math.max(0, grantedBalance - breakdownCurrentBalance)
                            local toAdd = math.min(-remaining, maxAddable)
                            toDeduct = -toAdd
                        end
                    else
                        -- Deduction: Cap at current_balance
                        -- Calculate how much we can deduct (ensure current_balance never goes below 0)
                        local maxDeductible = breakdownCurrentBalance
                        toDeduct = math.min(remaining, maxDeductible)
                    end
                    
                    if toDeduct ~= 0 then
                        -- Calculate new balance (ensure never below 0)
                        local newBalance = breakdownCurrentBalance - toDeduct
                        if newBalance < 0 then
                            newBalance = 0
                        end
                        
                        -- Record using accumulator
                        recordBreakdownCurrentBalanceDeduction(ctx, target, entityId, cusFeature, breakdown, index, toDeduct, newBalance)
                        
                        remaining = remaining - toDeduct
                    end
                end
            end
        end
    else
        -- No breakdowns: deduct from top-level current_balance
        -- Check if top-level cusFeature matches the filters (treat as single-item breakdown, and is not expired)
        if breakdownMatchesFilters(cusFeature, filters, nowMs) then
            local topLevelCurrentBalance = cusFeature.current_balance or 0
            -- For refunds (negative amount), always apply. For deductions, only if balance > 0
            if remaining < 0 or topLevelCurrentBalance > 0 then
                local toDeduct
                if remaining < 0 then
                    if overageBehavior == "allow" then
                        -- "allow" mode: no cap, add full refund amount
                        toDeduct = remaining  -- negative value, will be subtracted (adding to balance)
                    else
                        -- Normal mode: Cap at granted_balance
                        local grantedBalance = cusFeature.granted_balance or 0
                        local maxAddable = math.max(0, grantedBalance - topLevelCurrentBalance)
                        local toAdd = math.min(-remaining, maxAddable)
                        toDeduct = -toAdd
                    end
                else
                    -- Deduction: Cap at current_balance
                    -- Calculate how much we can deduct (ensure current_balance never goes below 0)
                    local maxDeductible = topLevelCurrentBalance
                    toDeduct = math.min(remaining, maxDeductible)
                end
                
                if toDeduct ~= 0 then
                    -- Calculate new balance (ensure never below 0)
                    local newBalance = topLevelCurrentBalance - toDeduct
                    if newBalance < 0 then
                        newBalance = 0
                    end
                    
                    -- Record using accumulator
                    recordCusFeatureCurrentBalanceDeduction(ctx, target, entityId, cusFeature, toDeduct, newBalance)
                    
                    remaining = remaining - toDeduct
                end
            end
        end
    end
    
    return { remaining = remaining }
end

-- Deduct from overage (handles purchased_balance adjustments)
-- hasAllocatedBypass: Checks if a cusFeature has allocated feature bypass (continuous use, non-consumable)
-- These features automatically allow overage unless overageBehavior is "reject"
-- Parameters:
--   cusFeature: The customer feature object
--   overageBehavior: "cap", "reject", or "allow"
-- Returns: boolean
local function hasAllocatedBypass(cusFeature, overageBehavior)
    return cusFeature.feature and cusFeature.feature.type == "metered" and cusFeature.feature.consumable == false and overageBehavior ~= "reject"
end

-- deductPositiveAmountFromOverage: Handles positive amount deductions from overage (incrementing purchased_balance)
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: The customer feature object with overage_allowed, max_purchase, purchased_balance
--   remaining: Amount remaining to deduct (positive)
--   overageBehavior: "cap" or "reject" or "allow"
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductPositiveAmountFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
    -- Check if this is an allocated feature that bypasses overage restrictions
    local allocatedFeatureBypass = hasAllocatedBypass(cusFeature, overageBehavior)
    
    -- If cusFeature has breakdowns, deduct from breakdown overage
    if cusFeature.breakdown and #cusFeature.breakdown > 0 then
        for index, breakdown in ipairs(cusFeature.breakdown) do
            if remaining <= 0 then break end
            
            -- Check if this breakdown matches the filters (and is not expired) and allows overage
            if breakdownMatchesFilters(breakdown, filters, nowMs) then
                -- Check if this breakdown explicitly allows overage
                -- Only deduct from breakdowns that have overage_allowed=true
                -- "allow" mode bypasses this check
                -- Allocated features (continuous use) automatically bypass breakdown-level overage check
                local breakdownAllowOverage = breakdown.overage_allowed == true or overageBehavior == "allow" or allocatedFeatureBypass
                
                if breakdownAllowOverage then
                    local breakdownPurchasedBalance = breakdown.purchased_balance or 0
                    -- Calculate availableCapacity: nil if unlimited, otherwise max_purchase - purchased_balance
                    local availableCapacity
                    if overageBehavior == "allow" or breakdown.max_purchase == nil or breakdown.max_purchase == cjson.null then
                        -- Unlimited capacity: "allow" mode or no max_purchase limit
                        availableCapacity = nil
                    else
                        -- Use breakdown max_purchase limit
                        local breakdownMaxPurchase = toNum(breakdown.max_purchase)
                        availableCapacity = breakdownMaxPurchase - breakdownPurchasedBalance
                    end
                    
                    local toIncrement = availableCapacity == nil and remaining or math.min(remaining, availableCapacity)
                    
                    if toIncrement > 0 then
                        -- Record using accumulator
                        recordBreakdownPurchasedBalanceIncrement(ctx, target, entityId, cusFeature, breakdown, index, toIncrement)
                        
                        remaining = remaining - toIncrement
                    end
                end
            end
        end
    else
        -- No breakdowns: deduct from top-level overage
        -- Check if top-level cusFeature matches the filters (treat as single-item breakdown, and is not expired)
        if breakdownMatchesFilters(cusFeature, filters, nowMs) then
            local topLevelPurchasedBalance = cusFeature.purchased_balance or 0
            -- Calculate availableCapacity: nil if unlimited, otherwise max_purchase - purchased_balance
            local availableCapacity
            if overageBehavior == "allow" or cusFeature.max_purchase == nil or cusFeature.max_purchase == cjson.null then
                -- Unlimited capacity: "allow" mode or no max_purchase limit
                availableCapacity = nil
            else
                -- Use max_purchase limit
                local topLevelMaxPurchase = toNum(cusFeature.max_purchase)
                availableCapacity = topLevelMaxPurchase - topLevelPurchasedBalance
            end
            
            local toIncrement = availableCapacity == nil and remaining or math.min(remaining, availableCapacity)
            
            if toIncrement > 0 then
                -- Record using accumulator
                recordCusFeaturePurchasedBalanceIncrement(ctx, target, entityId, cusFeature, toIncrement)
                
                remaining = remaining - toIncrement
            end
        end
    end
    
    return { remaining = remaining }
end

-- deductNegativeAmountFromOverage: Handles negative amount (refund) deductions from overage (decrementing purchased_balance)
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: The customer feature object with overage_allowed, max_purchase, purchased_balance
--   remaining: Amount remaining to refund (negative)
--   overageBehavior: "cap" or "reject" or "allow"
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductNegativeAmountFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
    -- Check if this is an allocated feature that bypasses overage restrictions
    local allocatedFeatureBypass = hasAllocatedBypass(cusFeature, overageBehavior)
    
    -- If cusFeature has breakdowns, refund from breakdown overage
    if cusFeature.breakdown and #cusFeature.breakdown > 0 then
        for index, breakdown in ipairs(cusFeature.breakdown) do
            if remaining >= 0 then break end
            
            -- Check if this breakdown matches the filters (and is not expired)
            if breakdownMatchesFilters(breakdown, filters, nowMs) then
                -- "allow" mode bypasses overage_allowed check for refunds too
                -- Allocated features (continuous use) automatically bypass breakdown-level overage check
                local breakdownAllowOverage = breakdown.overage_allowed == true or overageBehavior == "allow" or allocatedFeatureBypass
                if breakdownAllowOverage then
                    local breakdownPurchasedBalance = breakdown.purchased_balance or 0
                    local breakdownPrepaidQuantity = breakdown.prepaid_quantity or 0
                    -- Can only decrement purchased_balance down to prepaid_quantity (prepaid credits can't be refunded)
                    local decrementableAmount = math.max(0, breakdownPurchasedBalance - breakdownPrepaidQuantity)
                    local toDecrement = math.min(-remaining, decrementableAmount)
                    
                    if toDecrement > 0 then
                        -- Record using accumulator (toDecrement is positive, accumulator negates internally)
                        recordBreakdownOverageRefund(ctx, target, entityId, cusFeature, breakdown, index, toDecrement)
                        
                        remaining = remaining + toDecrement
                    end
                end
            end
        end
    else
        -- No breakdowns: refund from top-level overage
        -- Check if top-level cusFeature matches the filters (and is not expired)
        if breakdownMatchesFilters(cusFeature, filters, nowMs) then
            local topLevelPurchasedBalance = cusFeature.purchased_balance or 0
            local topLevelPrepaidQuantity = cusFeature.prepaid_quantity or 0
            -- Can only decrement purchased_balance down to prepaid_quantity (prepaid credits can't be refunded)
            local decrementableAmount = math.max(0, topLevelPurchasedBalance - topLevelPrepaidQuantity)
            local toDecrement = math.min(-remaining, decrementableAmount)
            
            if toDecrement > 0 then
                -- Record using accumulator (toDecrement is positive, accumulator negates internally)
                recordCusFeatureOverageRefund(ctx, target, entityId, cusFeature, toDecrement)
                
                remaining = remaining + toDecrement
            end
        end
    end
    
    return { remaining = remaining }
end

-- For positive amounts: increments purchased_balance up to max_purchase
-- For negative amounts (refunds): decrements purchased_balance down to 0
-- Only applies if overage_allowed is true
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: Balance object to deduct from
--   amount: Amount to handle (positive for deduction, negative for refund)
--   overageBehavior: "cap" or "reject" - affects allocatedFeatureBypass logic
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductFromOverage(ctx, target, entityId, cusFeature, amount, overageBehavior, filters)
    local remaining = amount
    
    -- Check if overage is allowed
    -- Continuous use features automatically allow overage (unless overageBehavior is "reject")
    -- "allow" mode bypasses all overage restrictions
    local allowOverage = cusFeature.overage_allowed or hasAllocatedBypass(cusFeature, overageBehavior) or overageBehavior == "allow"
    
    if not allowOverage then
        return { remaining = remaining }
    end
    
    -- POSITIVE AMOUNT: Increment purchased_balance up to max_purchase
    if remaining > 0 then
        local result = deductPositiveAmountFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
        remaining = result.remaining
    -- NEGATIVE AMOUNT (REFUND): Decrement purchased_balance down to 0
    else
        local result = deductNegativeAmountFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
        remaining = result.remaining
    end
    
    return { remaining = remaining }
end

-- Deduct from main balance (handles both breakdown and non-breakdown scenarios)
-- Handles both positive (deduct) and negative (refund) amounts
-- For positive amounts: deducts from current_balance, then overage
-- For negative amounts: refunds from overage (purchased_balance), then current_balance
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct (can be negative for refunds)
--   overageBehavior: "cap", "reject", or "allow" - passed to deductFromOverage and deductFromCurrentBalance
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductFromMainBalance(ctx, target, entityId, cusFeature, amount, overageBehavior, filters)
    local remaining = amount
    
    -- POSITIVE AMOUNT (DEDUCTION): current_balance → overage
    if remaining > 0 then
        -- Pass 1: Deduct from current_balance
        local currentBalanceResult = deductFromCurrentBalance(ctx, target, entityId, cusFeature, remaining, filters, overageBehavior)
        remaining = currentBalanceResult.remaining
        
        -- Pass 2: Deduct from overage (increments purchased_balance up to max_purchase)
        if remaining > 0 then
            local overageResult = deductFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
            remaining = overageResult.remaining
        end
    -- NEGATIVE AMOUNT (REFUND): overage → current_balance
    else
        -- Pass 1: Refund from overage (decrements purchased_balance down to 0)
        local overageResult = deductFromOverage(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
        remaining = overageResult.remaining
        
        -- Pass 2: Refund to current_balance (increments current_balance)
        if remaining < 0 then
            local currentBalanceResult = deductFromCurrentBalance(ctx, target, entityId, cusFeature, remaining, filters, overageBehavior)
            remaining = currentBalanceResult.remaining
        end
    end
    
    return { remaining = remaining }
end



-- ============================================================================
-- DEDUCTION COORDINATION FUNCTIONS
-- ============================================================================

-- Deduct from a single customer feature (handles rollovers + main balance)
-- All deltas and state changes are written directly to ctx
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   target: "customer" or "entity"
--   entityId: Entity ID if target is "entity", nil otherwise
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct
--   overageBehavior: "cap" or "reject"
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductFromCusFeature(ctx, target, entityId, cusFeature, amount, overageBehavior, filters)
    -- Step 1: Deduct from rollovers first (rollovers don't use breakdown filters)
    local rolloverResult = deductFromRollovers(ctx, target, entityId, cusFeature, amount)
    local remaining = rolloverResult.remaining
    
    -- Step 2: Deduct remaining from main balance (with filters)
    if remaining ~= 0 then
        local mainResult = deductFromMainBalance(ctx, target, entityId, cusFeature, remaining, overageBehavior, filters)
        remaining = mainResult.remaining
    end
    
    return { remaining = remaining }
end


-- Deduct from customer feature AND/OR entity features
-- If targetEntityId is provided, only deduct from that entity (entity-level tracking)
-- If targetEntityId is nil, deduct from ALL entities (customer-level tracking)
-- customerFeature can be nil for entity-only features
-- All deltas and state changes are written directly to ctx
-- Parameters:
--   ctx: Context object for accumulating deltas and state changes
--   featureId: Feature ID to look up in entity maps
--   customerFeature: Customer balance object (can be nil for entity-only features)
--   entityFeaturesMap: Map of entityId -> { [featureId] -> balance }
--   amount: Amount to deduct
--   targetEntityId: Optional entity ID for entity-level tracking
--   overageBehavior: "cap" or "reject"
--   filters: Optional { id?: string, interval?: string } to filter which breakdown items to consider
-- Returns: { remaining: number }
local function deductFromFeatureWithEntities(ctx, featureId, customerFeature, entityFeaturesMap, amount, targetEntityId, overageBehavior, filters)
    local remaining = amount
    
    -- Always ensure state change entries exist for touched features (even if no changes happen)
    -- This matches old behavior where entries were always added to requestStateChanges
    if customerFeature then
        getStateChangeEntry(ctx, "customer", nil, customerFeature)
    end
    if targetEntityId then
        -- Entity-level: ensure entry for specific entity
        local entityFeatures = entityFeaturesMap[targetEntityId]
        if entityFeatures and entityFeatures[featureId] then
            getStateChangeEntry(ctx, "entity", targetEntityId, entityFeatures[featureId])
        end
    else
        -- Customer-level: ensure entries for all entities with this feature
        for entityId, entityFeatures in pairs(entityFeaturesMap) do
            if entityFeatures[featureId] then
                getStateChangeEntry(ctx, "entity", entityId, entityFeatures[featureId])
            end
        end
    end
    
    if targetEntityId then
        -- Entity-level tracking: deduct from entity FIRST, then customer
        
        -- Step 1: Deduct from entity rollovers (rollovers don't use breakdown filters)
        local entityFeatures = entityFeaturesMap[targetEntityId]
        if entityFeatures then
            local entityFeature = entityFeatures[featureId]
            if entityFeature and remaining > 0 then
                local entityRolloverResult = deductFromRollovers(ctx, "entity", targetEntityId, entityFeature, remaining)
                remaining = entityRolloverResult.remaining
            end
        end
        
        -- Step 2: Deduct from entity main balance (with filters)
        if entityFeatures then
            local entityFeature = entityFeatures[featureId]
            if entityFeature and remaining ~= 0 then
                local entityMainResult = deductFromMainBalance(ctx, "entity", targetEntityId, entityFeature, remaining, overageBehavior, filters)
                remaining = entityMainResult.remaining
            end
        end
        
        -- Step 3: Deduct from customer rollovers (only if customerFeature exists)
        if customerFeature and remaining > 0 then
            local customerRolloverResult = deductFromRollovers(ctx, "customer", nil, customerFeature, remaining)
            remaining = customerRolloverResult.remaining
        end
        
        -- Step 4: Deduct from customer main balance (only if customerFeature exists)
        if customerFeature and remaining ~= 0 then
            local customerMainResult = deductFromMainBalance(ctx, "customer", nil, customerFeature, remaining, overageBehavior, filters)
            remaining = customerMainResult.remaining
        end
    else
        -- Customer-level tracking: customer participates in sequential deduction WITH entities
        -- Both share the same 2-phase approach: rollovers → current_balance → overage
        
        -- Build sorted entity list for consistent ordering
        local sortedEntityIds = {}
        for entityId in pairs(entityFeaturesMap) do
            table.insert(sortedEntityIds, entityId)
        end
        table.sort(sortedEntityIds)
        
        -- Step 1: Deduct from customer rollovers first (if exists)
        if customerFeature and remaining > 0 then
            local customerRolloverResult = deductFromRollovers(ctx, "customer", nil, customerFeature, remaining)
            remaining = customerRolloverResult.remaining
        end
        
        -- Step 2: Deduct from all entity rollovers (sorted for consistency)
        if remaining > 0 then
            for _, entityId in ipairs(sortedEntityIds) do
                if remaining <= 0 then break end
                local entityFeatures = entityFeaturesMap[entityId]
                local entityFeature = entityFeatures[featureId]
                if entityFeature then
                    local entityRolloverResult = deductFromRollovers(ctx, "entity", entityId, entityFeature, remaining)
                    remaining = entityRolloverResult.remaining
                end
            end
        end
        
        -- Step 3: Main balance deduction with 2-phase approach
        -- Customer participates alongside entities in the same phases
        if remaining ~= 0 then
            if remaining > 0 then
                -- POSITIVE AMOUNT: current_balance → overage
                -- Phase 1: Deduct from current_balance of customer, then ALL entities
                if customerFeature then
                    local customerCurrentResult = deductFromCurrentBalance(ctx, "customer", nil, customerFeature, remaining, filters, overageBehavior)
                    remaining = customerCurrentResult.remaining
                end
                
                for _, entityId in ipairs(sortedEntityIds) do
                    if remaining <= 0 then break end
                    local entityFeatures = entityFeaturesMap[entityId]
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature then
                        local currentBalanceResult = deductFromCurrentBalance(ctx, "entity", entityId, entityFeature, remaining, filters, overageBehavior)
                        remaining = currentBalanceResult.remaining
                    end
                end
                
                -- Phase 2: Deduct from overage of customer, then ALL entities
                if remaining > 0 and customerFeature then
                    local customerOverageResult = deductFromOverage(ctx, "customer", nil, customerFeature, remaining, overageBehavior, filters)
                    remaining = customerOverageResult.remaining
                end
                
                for _, entityId in ipairs(sortedEntityIds) do
                    if remaining <= 0 then break end
                    local entityFeatures = entityFeaturesMap[entityId]
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature then
                        local overageResult = deductFromOverage(ctx, "entity", entityId, entityFeature, remaining, overageBehavior, filters)
                        remaining = overageResult.remaining
                    end
                end
            else
                -- NEGATIVE AMOUNT (REFUND): overage → current_balance
                -- Phase 1: Refund from overage of customer, then ALL entities
                if customerFeature then
                    local customerOverageResult = deductFromOverage(ctx, "customer", nil, customerFeature, remaining, overageBehavior, filters)
                    remaining = customerOverageResult.remaining
                end
                
                for _, entityId in ipairs(sortedEntityIds) do
                    if remaining >= 0 then break end
                    local entityFeatures = entityFeaturesMap[entityId]
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature then
                        local overageResult = deductFromOverage(ctx, "entity", entityId, entityFeature, remaining, overageBehavior, filters)
                        remaining = overageResult.remaining
                    end
                end
                
                -- Phase 2: Refund to current_balance of customer, then ALL entities
                if remaining < 0 and customerFeature then
                    local customerCurrentResult = deductFromCurrentBalance(ctx, "customer", nil, customerFeature, remaining, filters, overageBehavior)
                    remaining = customerCurrentResult.remaining
                end
                
                for _, entityId in ipairs(sortedEntityIds) do
                    if remaining >= 0 then break end
                    local entityFeatures = entityFeaturesMap[entityId]
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature then
                        local currentBalanceResult = deductFromCurrentBalance(ctx, "entity", entityId, entityFeature, remaining, filters, overageBehavior)
                        remaining = currentBalanceResult.remaining
                    end
                end
            end
        end
    end
    
    return { remaining = remaining }
end

-- ============================================================================
-- REQUEST PROCESSING
-- ============================================================================

-- Helper: Calculate sync deltas for sync mode requests
-- In sync mode, we want to adjust cache to match the target balance from Postgres
-- If entityId is provided, loads entity-level balances (entity + customer)
-- If entityId is nil, loads customer-level balances (customer + all entities)
-- If filters are provided, uses filtered balance (sum of matching breakdown current_balances)
-- Parameters:
--   featureDeductions: array of { featureId, amount }
--   targetBalance: target balance to sync to
--   entityId: optional entity ID for entity-level tracking
--   filters: optional { id?: string, interval?: string } to filter breakdown items
local function calculateSyncDeltas(featureDeductions, targetBalance, entityId, filters)
    -- Load merged balances based on perspective (entity-level or customer-level)
    local mergedFeatures = loadBalances(cacheKey, orgId, env, customerId, entityId)
    
    if not mergedFeatures then
        return -- Customer/entity not in cache, no-op
    end
    
    for _, featureDeduction in ipairs(featureDeductions) do
        local featureId = featureDeduction.featureId
        local mergedFeature = mergedFeatures[featureId]
        
        if mergedFeature and not mergedFeature.unlimited then
            -- Calculate "backend balance" which accounts for purchased_balance and prepaid_quantity
            -- Formula: current_balance + purchased_balance - prepaid_quantity
            -- This gives us the underlying balance that should be compared against the target
            local backendBalance = balanceToBackendBalance(mergedFeature, filters)
            
            -- Calculate delta (positive means deduct, negative means refund)
            -- Example: backendBalance=10, targetBalance=7 → delta=3 (need to deduct 3)
            -- Example: backendBalance=5, targetBalance=7 → delta=-2 (need to refund 2)
            -- Example: backendBalance=-50, targetBalance=-100 → delta=50 (need to deduct 50 more)
            local delta = backendBalance - targetBalance
            
            -- Override the amount with the calculated delta
            featureDeduction.amount = delta
        end
    end
end

-- Helper: Apply state changes to a cusFeature object
local function applyStateChanges(cusFeature, stateChanges)
    for _, change in ipairs(stateChanges) do
        if change.type == "cusFeature" then
            if change.newValue then
                cusFeature[change.field] = change.newValue
            elseif change.delta then
                cusFeature[change.field] = (cusFeature[change.field] or 0) + change.delta
            end
        elseif change.type == "breakdown" then
            local breakdown = cusFeature.breakdown[change.index]
            if breakdown then
                if change.newValue then
                    breakdown[change.field] = change.newValue
                elseif change.delta then
                    breakdown[change.field] = (breakdown[change.field] or 0) + change.delta
                end
            end
        elseif change.type == "rollover" then
            local rollover = cusFeature.rollovers[change.index]
            if rollover then
                if change.newValue then
                    rollover[change.field] = change.newValue
                elseif change.delta then
                    rollover[change.field] = (rollover[change.field] or 0) + change.delta
                end
            end
        end
    end
end

-- Process a single request (one unit with multiple cusFeature deductions)
-- Returns: { success: boolean, error?: string, modifiedBreakdownIds?: array }
local function processRequest(request, loadedCusFeatures, entityFeatureStates)
    local featureDeductions = request.featureDeductions
    local overageBehavior = request.overageBehavior or "cap"
    local entityId = request.entityId -- nil for customer-level tracking, set for entity-level tracking
    local syncMode = request.syncMode or false
    local targetBalance = request.targetBalance
    local filters = request.filters -- optional: { id: string, interval: string } to filter breakdown items
    
    -- Initialize context object for accumulating results
    -- This context collects deltas, state changes, and modified breakdown IDs
    -- State changes are written directly to ctx by the deduction functions
    -- Structure: array of {target, cusFeature, entityId, changes}
    local ctx = createContext(adjustGrantedBalance)
    
    -- SYNC MODE: Calculate delta to bring cache to target balance
    -- Note: syncMode requests should only have ONE feature deduction
    -- If filters are provided, uses filtered balance for delta calculation
    if syncMode and targetBalance then
        calculateSyncDeltas(featureDeductions, targetBalance, entityId, filters)
    end
    
    -- Try to deduct from all features (primary + credit systems)
    for _, featureDeduction in ipairs(featureDeductions) do
        local featureId = featureDeduction.featureId
        local amount = featureDeduction.amount
        local cusFeature = loadedCusFeatures[featureId]
        
        -- Check for paid allocated features (continuous use with overage)
        -- These should use Postgres-based tracking, not Redis
        if cusFeature and cusFeature.feature then
            local isPaidAllocated = cusFeature.feature.type == "metered" 
                and cusFeature.feature.consumable == false 
                and cusFeature.overage_allowed == true
            
            if isPaidAllocated then
                return {
                    success = false,
                    error = "PAID_ALLOCATED"
                }
            end
        end
        
        -- Step 1: Try to deduct from primary cusFeature first
        local remainingAmount = amount
        
        if cusFeature then
            -- Customer has this feature - deduct from customer + entities
            if not cusFeature.unlimited then
                -- All deltas and state changes are written directly to ctx
                local result = deductFromFeatureWithEntities(ctx, featureId, cusFeature, entityFeatureStates, amount, entityId, overageBehavior, filters)
                remainingAmount = result.remaining
            else
                -- Unlimited feature covers everything
                -- Mark as "changed" so balance gets returned
                customerChanged = true
                changedCustomerFeatureIds[cusFeature.id] = true
                remainingAmount = 0
            end
        else
            -- Entity-only feature - customer doesn't have it, only entities do
            -- Check for unlimited entities first
            local hasUnlimited = false
            for entId, entityFeatures in pairs(entityFeatureStates) do
                local entityFeature = entityFeatures[featureId]
                if entityFeature and entityFeature.unlimited then
                    -- Mark as "changed" so balance gets returned
                    changedEntityIds[entId] = true
                    if not changedEntityFeatureIds[entId] then
                        changedEntityFeatureIds[entId] = {}
                    end
                    changedEntityFeatureIds[entId][entityFeature.id] = true
                    hasUnlimited = true
                end
            end
            
            if hasUnlimited then
                remainingAmount = 0
            else
                -- Use deductFromFeatureWithEntities with nil customerFeature
                local result = deductFromFeatureWithEntities(ctx, featureId, nil, entityFeatureStates, amount, entityId, overageBehavior, filters)
                remainingAmount = result.remaining
            end
        end
        
        -- Step 2: If there's remaining amount, try credit systems
        -- Note: Credit systems don't use filters - filters are for targeting specific breakdown items
        -- within the primary feature being deducted
        if remainingAmount ~= 0 then
            -- Find credit system cusFeatures that reference this feature
            for _, otherCusFeature in pairs(loadedCusFeatures) do
                -- Check if this balance has a feature with credit_schema
                if otherCusFeature.feature and otherCusFeature.feature.credit_schema then
                    -- Check if this credit system references our feature
                    for _, creditItem in ipairs(otherCusFeature.feature.credit_schema) do
                        if creditItem.metered_feature_id == featureId then
                            -- Calculate credit amount needed for remaining
                            local creditAmount = remainingAmount * creditItem.credit_cost
                            
                            if not otherCusFeature.unlimited then
                                -- Note: Don't pass filters to credit systems - they're separate features
                                -- All deltas and state changes are written directly to ctx
                                local result = deductFromFeatureWithEntities(ctx, otherCusFeature.id, otherCusFeature, entityFeatureStates, creditAmount, entityId, overageBehavior, nil)
                                
                                -- Update remaining based on what credit system could cover
                                -- If credit system couldn't cover all, calculate how much of original remains
                                if result.remaining ~= 0 then
                                    local creditCovered = creditAmount - result.remaining
                                    local originalCovered = creditCovered / creditItem.credit_cost
                                    remainingAmount = remainingAmount - originalCovered
                                else
                                    -- Credit system covered everything
                                    remainingAmount = 0
                                end
                            else
                                -- Unlimited credit system covers everything
                                -- Mark as "changed" so balance gets returned
                                customerChanged = true
                                changedCustomerFeatureIds[otherCusFeature.id] = true
                                remainingAmount = 0
                            end
                            break
                        end
                    end
                end
                
                -- Stop if we've covered everything
                if remainingAmount == 0 then
                    break
                end
            end
        end
        
        -- Step 3: Check if request can succeed based on overage behavior
        if remainingAmount > 0 and overageBehavior == "reject" then
            return {
                success = false,
                error = "INSUFFICIENT_BALANCE"
            }
        end
    end
    
    -- Request succeeded - merge deltas from context into global accumulator
    for _, delta in ipairs(ctx.deltas) do
        addDelta(delta.key, delta.field, delta.delta)
    end
    
    -- Apply state changes from context
    for _, stateChange in ipairs(ctx.stateChanges) do
        applyStateChanges(stateChange.cusFeature, stateChange.changes)
        
        -- Track which scopes were modified (customer vs entity)
        if stateChange.target == "customer" then
            customerChanged = true
            -- Track which customer feature was changed
            if stateChange.cusFeature and stateChange.cusFeature.id then
                changedCustomerFeatureIds[stateChange.cusFeature.id] = true
            end
        elseif stateChange.target == "entity" and stateChange.entityId then
            changedEntityIds[stateChange.entityId] = true
            -- Track which entity feature was changed
            if stateChange.cusFeature and stateChange.cusFeature.id then
                if not changedEntityFeatureIds[stateChange.entityId] then
                    changedEntityFeatureIds[stateChange.entityId] = {}
                end
                changedEntityFeatureIds[stateChange.entityId][stateChange.cusFeature.id] = true
            end
        end
    end
    
    return {
        success = true,
        error = nil,
        modifiedBreakdownIds = ctx.modifiedBreakdownIds
    }
end

-- ============================================================================
-- MAIN EXECUTION
-- ============================================================================

-- Collect all unique feature IDs from all requests
local requestedFeatureIds = {}
for _, request in ipairs(requests) do
    for _, featureDeduction in ipairs(request.featureDeductions) do
        requestedFeatureIds[featureDeduction.featureId] = true
    end
end

-- -- Helper function to apply legacy continuous_use logic
-- -- Legacy case: continuous_use features always allow overage
-- local function applyContinuousUseLegacy(balance)
--     if balance.feature and balance.feature.type == "metered" and balance.feature.consumable == false and remaining > 0 then
--         balance.overage_allowed = true
--         -- Apply to breakdowns as well
--         if balance.breakdown then
--             for _, breakdown in ipairs(balance.breakdown) do
--                 breakdown.overage_allowed = true
--             end
--         end
--     end
-- end

-- Get list of all customer feature IDs
local baseJson = redis.call("GET", cacheKey)
local allFeatureIds = {}
if baseJson then
    local baseCustomer = cjson.decode(baseJson)
    allFeatureIds = baseCustomer._balanceFeatureIds or {}
end

-- Load all customer balances (so we can find credit systems)
local loadedCusFeatures = {}
for _, featureId in ipairs(allFeatureIds) do
    local balance = loadBalance(cacheKey, featureId)
    if balance then
        -- Add id field for compatibility with existing code
        balance.id = featureId
        
        -- -- Apply legacy continuous_use logic
        -- applyContinuousUseLegacy(balance)
        
        loadedCusFeatures[featureId] = balance
    end
end

-- Get entity IDs from customer
local baseCustomer = cjson.decode(baseJson)
local entityIds = baseCustomer._entityIds or {}

-- Load all entity features: { [entityId] = { [featureId] = entityFeature } }
local entityFeatureStates = {}
for _, entityId in ipairs(entityIds) do
    local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        local entityBase = cjson.decode(entityBaseJson)
        local entityFeatureIds = entityBase._balanceFeatureIds or {}
        entityFeatureStates[entityId] = {}
        
        for _, featureId in ipairs(entityFeatureIds) do
            -- Load entity balance using shared utility function
            local balance = loadBalance(entityCacheKey, featureId)
            if balance then
                -- Add id field for compatibility with existing code
                balance.id = featureId
                
                -- -- Apply legacy continuous_use logic
                -- applyContinuousUseLegacy(balance)
                
                entityFeatureStates[entityId][featureId] = balance
            end
        end
    end
end

-- Process all requests and collect modified breakdown IDs
local results = {}
for i, request in ipairs(requests) do
    local result = processRequest(request, loadedCusFeatures, entityFeatureStates)
    table.insert(results, result)
    
    -- Collect modified breakdown IDs from successful requests
    if result.success and result.modifiedBreakdownIds then
        for _, breakdownId in ipairs(result.modifiedBreakdownIds) do
            -- Use a set to deduplicate
            allModifiedBreakdownIds[breakdownId] = true
        end
    end
end

-- Convert allModifiedBreakdownIds set to array for return
local modifiedBreakdownIdsArray = {}
for breakdownId, _ in pairs(allModifiedBreakdownIds) do
    table.insert(modifiedBreakdownIdsArray, breakdownId)
end

-- Apply all accumulated deltas (ONE Redis write per key per field)
for key, deltas in pairs(keyDeltas) do
    for field, delta in pairs(deltas) do
        if delta ~= 0 then
            redis.call("HINCRBYFLOAT", key, field, delta)
        end
        
    end
end

-- Convert changedEntityIds set to array
local changedEntityIdsArray = {}
for entityId, _ in pairs(changedEntityIds) do
    table.insert(changedEntityIdsArray, entityId)
end

-- Calculate actual deductions per feature from keyDeltas
-- Sum up usage deltas (or granted_balance deltas if adjustGrantedBalance is true)
local featureDeductions = {}
for key, deltas in pairs(keyDeltas) do
    -- Extract featureId from key (format: "{orgId}:env:customer:{version}:customerId:balances:featureId" or with ":entity:entityId:balances:featureId")
    local featureId = key:match(":balances:([^:]+)$")
    if featureId then
        local deductionAmount = 0
        if adjustGrantedBalance then
            -- When adjustGrantedBalance is true, we decrement granted_balance (negative delta = deduction)
            deductionAmount = -(deltas.granted_balance or 0)
        else
            -- Normal case: increment usage (positive delta = deduction)
            deductionAmount = deltas.usage or 0
        end
        
        if deductionAmount ~= 0 then
            featureDeductions[featureId] = (featureDeductions[featureId] or 0) + deductionAmount
        end
    end
end

-- ============================================================================
-- LOAD CHANGED BALANCES AFTER DEDUCTIONS (MERGED VERSIONS)
-- ============================================================================

-- Collect all changed balances (customer + entities) as object keyed by featureId
local changedBalances = {}

-- Load merged customer balances if customer was changed
if customerChanged then
    local customerObject = getCustomerObject(orgId, env, customerId, false)
    if customerObject and customerObject.balances then
        -- Extract only the changed customer balances
        for featureId, _ in pairs(changedCustomerFeatureIds) do
            local balance = customerObject.balances[featureId]
            if balance then
                changedBalances[featureId] = balance
            end
        end
    end
end

-- Load merged entity balances for each changed entity
for entityId, featureIds in pairs(changedEntityFeatureIds) do
    local entityObject = getEntityObject(orgId, env, customerId, entityId, false)
    if entityObject and entityObject.balances then
        -- Extract only the changed entity balances
        for featureId, _ in pairs(featureIds) do
            local balance = entityObject.balances[featureId]
            if balance then
                changedBalances[featureId] = balance
            end
        end
    end
end

-- Return results with changed scopes, changed balances, and modified breakdown IDs
return cjson.encode({
    success = true,
    results = results,
    customerChanged = customerChanged,
    changedEntityIds = changedEntityIdsArray,
    balances = changedBalances,
    featureDeductions = featureDeductions,
    modifiedBreakdownIds = modifiedBreakdownIdsArray
})


