-- ============================================================================
-- FULL CUSTOMER UTILITIES
-- Functions for navigating the FullCustomer JSON structure in Redis
-- ============================================================================

-- ============================================================================
-- Path builders: construct JSON paths from array indices
-- ============================================================================
local function build_customer_entitlement_base_path(cp_idx, ce_idx)
  return '$.customer_products[' .. cp_idx .. '].customer_entitlements[' .. ce_idx .. ']'
end

local function build_extra_customer_entitlement_base_path(ece_idx)
  return '$.extra_customer_entitlements[' .. ece_idx .. ']'
end

-- ============================================================================
-- Build entity path (consistent across all operations)
-- ============================================================================
local function build_entity_path(base_path, entity_id)
  return base_path .. '["entities"]["' .. entity_id .. '"]'
end

-- ============================================================================
-- Find entitlement in decoded FullCustomer by ID (fallback path)
-- Returns: cus_ent table, cus_product table (or nil for loose), cus_ent_index, cus_product_index (or nil for loose)
-- ============================================================================
local function find_entitlement(full_customer, ent_id)
  if full_customer.customer_products then
    for cp_idx, cus_product in ipairs(full_customer.customer_products) do
      if cus_product.customer_entitlements then
        for ce_idx, cus_ent in ipairs(cus_product.customer_entitlements) do
          if cus_ent.id == ent_id then
            return cus_ent, cus_product, ce_idx, cp_idx
          end
        end
      end
    end
  end

  if full_customer.extra_customer_entitlements then
    for ece_idx, cus_ent in ipairs(full_customer.extra_customer_entitlements) do
      if cus_ent.id == ent_id then
        return cus_ent, nil, ece_idx, nil
      end
    end
  end

  return nil, nil, nil, nil
end

-- ============================================================================
-- Find entitlement via the path index Hash (fast path)
-- Returns: { base_path, entity_feature_id } or nil
-- ============================================================================
local function find_entitlement_from_index(pathidx_key, cus_ent_id)
  local raw = redis.call('HGET', pathidx_key, 'cus_ent:' .. cus_ent_id)
  if not raw then return nil end
  local entry = cjson.decode(raw)
  local base_path
  if entry.ece then
    base_path = build_extra_customer_entitlement_base_path(entry.ece)
  else
    base_path = build_customer_entitlement_base_path(entry.cp, entry.ce)
  end
  return {
    base_path = base_path,
    entity_feature_id = entry.ef,
  }
end

-- ============================================================================
-- Fetch a customer entitlement sub-object via path index + single JSON.GET.
-- Combines index lookup and document read in one call to minimise tree traversals.
-- Returns: { base_path, has_entity_scope, is_loose, sub } or nil
-- ============================================================================
local function get_customer_entitlement_via_index(params)
  local pathidx_key = params.pathidx_key
  local cache_key = params.cache_key
  local cus_ent_id = params.cus_ent_id

  local idx_result = find_entitlement_from_index(pathidx_key, cus_ent_id)
  if not idx_result then return nil end

  local base_path = idx_result.base_path
  local sub_raw = redis.call('JSON.GET', cache_key, base_path)
  if not sub_raw or sub_raw == cjson.null then return nil end

  local sub = cjson.decode(sub_raw)
  if type(sub) == 'table' and sub[1] ~= nil and type(sub[1]) == 'table' then
    sub = sub[1]
  end

  return {
    base_path = base_path,
    has_entity_scope = not is_nil(idx_result.entity_feature_id),
    is_loose = string.find(base_path, 'extra_customer_entitlements') ~= nil,
    sub = sub,
  }
end
