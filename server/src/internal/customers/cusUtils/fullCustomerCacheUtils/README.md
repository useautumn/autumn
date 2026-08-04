# Deprecated: FullCustomer cache (removed)

The legacy FullCustomer Redis cache has been fully removed. The only file left
is `deleteCachedFullCustomer` — a thin wrapper over `invalidateCachedFullSubject`
kept because the cloud superset repo imports it from ~150 files.

All cache reads, writes, invalidations, and Lua changes use the FullSubject
cache under `server/src/internal/customers/cache/fullSubject` and
`server/src/_luaScriptsV2/fullSubject`.

Delete this shim once the cloud repo migrates to the FullSubject APIs. Cloud
files importing the deleted `updateCachedCustomerData` /
`batchDeleteCachedFullCustomers` need fixing there (see
.plans/redis-cloud-migration/CLOUD-AUDIT.md).
