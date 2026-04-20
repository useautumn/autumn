-- ============================================================================
-- UPDATE CONTEXT UTILITIES
-- Builds a context object for updateSubjectBalances by reading existing
-- SubjectBalance entries from the per-feature hash.
-- ============================================================================

local function init_update_context(params)
  local balance_key = params.balance_key
  local updates = params.updates

  local logs = {}
  local logger = {
    log = function(fmt, ...)
      table.insert(logs, string.format(fmt, ...))
    end,
  }

  local context = {
    customer_entitlements = {},
    mutation_logs = {},
    balance_key = balance_key,
    logs = logs,
    logger = logger,
  }

  local cus_ent_ids = {}
  for _, update in ipairs(updates) do
    table.insert(cus_ent_ids, update.cus_ent_id)
  end

  if #cus_ent_ids > 0 then
    local raw_values = redis.call('HMGET', balance_key, unpack(cus_ent_ids))

    for i, cus_ent_id in ipairs(cus_ent_ids) do
      local subject_balance = safe_decode(raw_values[i])
      if type(subject_balance) == 'table' then
        context.customer_entitlements[cus_ent_id] = {
          balance_key = balance_key,
          subject_balance = subject_balance,
        }
      end
    end
  end

  return context
end
