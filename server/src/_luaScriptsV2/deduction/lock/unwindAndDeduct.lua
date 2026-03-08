-- ============================================================================
-- UNWIND AND DEDUCT
-- Reconciles a lock by first unwinding the receipt tail, then optionally
-- applying an additional deduction/refund against the live cached customer.
-- Returns the same shape as deductFromCustomerEntitlements.
-- ============================================================================

local params = cjson.decode(ARGV[1])
local cache_key = params.full_customer_cache_key
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if is_nil(full_customer_json) then
  return cjson.encode({
    error = 'CUSTOMER_NOT_FOUND',
    updates = {},
    rollover_updates = {},
    remaining = 0,
    mutation_logs = cjson.decode('[]'),
    logs = {},
  })
end

local context = init_context({
  cache_key = cache_key,
  customer_entitlement_ids = params.customer_entitlement_ids or {},
  full_customer = cjson.decode(full_customer_json),
})



local unwind_result = unwind_lock_on_context({
  context = context,
  lock_receipt_key = params.lock_receipt_key,
  unwind_value = params.unwind_value or 0,
})

context.logger.log("UNWIND AND DEDUCT: unwind_result=%s", cjson.encode(unwind_result))

if not is_nil(unwind_result.error) then
  return cjson.encode({
    error = unwind_result.error,
    updates = {},
    rollover_updates = {},
    remaining = 0,
    mutation_logs = context.mutation_logs or cjson.decode('[]'),
    logs = context.logs or {},
  })
end

local additional_value = params.additional_value or 0
local deduction_result = {
  updates = {},
  rollover_updates = {},
  remaining_amount = 0,
}

context.logger.log("UNWIND AND DEDUCT: additional_value=%s", additional_value)
if additional_value == 0 then
  apply_pending_writes(cache_key, context)
else
  deduction_result = run_deduction_on_context({
    context = context,
    sorted_entitlements = params.sorted_entitlements or {},
    rollovers = params.rollovers,
    amount_to_deduct = params.amount_to_deduct,
    target_entity_id = params.target_entity_id,
  })

  apply_pending_writes(cache_key, context)
end

return cjson.encode({
  error = cjson.null,
  updates = deduction_result.updates or {},
  rollover_updates = deduction_result.rollover_updates or {},
  remaining = deduction_result.remaining_amount or 0,
  mutation_logs = context.mutation_logs or cjson.decode('[]'),
  logs = context.logs or {},
})
