# Deprecated: FullCustomer cache

This directory contains compatibility code for the old FullCustomer Redis
cache. It is not part of the active customer-read path.

New cache reads, writes, invalidations, and Lua changes must use the FullSubject
cache under:

- `server/src/internal/customers/cache/fullSubject`
- `server/src/_luaScriptsV2/fullSubject`

Do not add new FullCustomer-cache behavior here.
