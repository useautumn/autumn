# TODOs

## Cache Invalidation
- [ ] `cusUtils.ts:66-71` - Add `deleteCachedFullCustomer` call when `updateCustomerDetails` updates a customer (currently only invalidates ApiCustomer cache)

## Lua Scripts
- [x] `deduction/deductFromFullCustomer.lua` - Main deduction script (mirrors `performDeduction.sql`)
- [x] `luaScriptsV2.ts` - TypeScript loader for Lua scripts
- [x] `executeRedisDeduction.ts` - Calls the Lua script
