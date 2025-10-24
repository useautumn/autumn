# Test Migration Tracker

Track the progress of migrating test files from global state to isolated test context.

## Migration Status

Legend:
- ✅ = Migrated and passing
- 🚧 = In progress
- ⏳ = Not started
- ⚠️ = Needs review
- ❌ = Skipped/Archived

## Test Files to Migrate

### Basic Tests
- [x] ✅ `tests/attach/basic/basic1.test.ts` - Migrated
- [x] ✅ `tests/attach/basic/basic2.test.ts` - Migrated (renamed from basic4)
- [x] ✅ `tests/attach/basic/basic3.test.ts` - Migrated (renamed from basic5)
- [x] ✅ `tests/attach/basic/basic6.test.ts` - Migrated
- [x] ✅ `tests/attach/basic/basic7.test.ts` - Migrated
- [x] ✅ `tests/attach/basic/basic8.test.ts` - Migrated
- [x] ✅ `tests/attach/basic/basic9.test.ts` - Migrated
- [x] ✅ `tests/attach/basic/basic10.test.ts` - Migrated

### Downgrade Tests
- [ ] ⏳ `tests/attach/downgrade/downgrade5.test.ts`
- [ ] ⏳ `tests/attach/downgrade/downgrade6.test.ts`
- [ ] ⏳ `tests/attach/downgrade/downgrade7.test.ts`

### Multi-Product Tests
- [ ] ⏳ `tests/attach/multiProduct/multiProduct1.ts`
- [ ] ⏳ `tests/attach/multiProduct/multiProduct2.ts`

### Other Tests
- [ ] ⏳ `tests/attach/others/others4.ts`
- [ ] ⏳ `tests/attach/others/others5.ts`

### Upgrade (Old) Tests
- [ ] ⏳ `tests/attach/upgradeOld/upgradeOld1.ts`
- [ ] ⏳ `tests/attach/upgradeOld/upgradeOld2.ts`
- [ ] ⏳ `tests/attach/upgradeOld/upgradeOld3.ts`
- [ ] ⏳ `tests/attach/upgradeOld/upgradeOld4.ts`

### Core Tests
- [ ] ⏳ `tests/core/cancel/cancel5.test.ts`

### Continuous Use Tests
- [ ] ⏳ `tests/contUse/track/track5.ts`

### Advanced Tests
- [ ] ⏳ `tests/advanced/coupons/coupon1.ts`
- [ ] ⏳ `tests/advanced/multiFeature/multiFeature1.ts`
- [ ] ⏳ `tests/advanced/multiFeature/multiFeature2.ts`
- [ ] ⏳ `tests/advanced/multiFeature/multiFeature3.ts`

### Archived Tests (Review if needed)
- [ ] ❌ `tests/archives/arrear_prorated/arrear_prorated2.ts`
- [ ] ❌ `tests/archives/arrear_prorated/arrear_prorated3.ts`
- [ ] ❌ `tests/archives/coupon1 copy.ts`

## Utility Files (Don't Migrate)
These are helper files, not tests:
- `tests/utils/compare.ts`
- `tests/utils/advancedUsageUtils.ts`

## Migration Prompt

When ready to migrate a file, use this prompt:

```
Migrate the test file [FILE_PATH] from using global state to isolated test context.

Reference the migration guide at @server/tests/MIGRATION_GUIDE.md for the full pattern.

**Critical Requirements:**
1. DO NOT remove any existing test logic - preserve ALL test cases and assertions
2. DO NOT remove any force_checkout tests or other edge case tests
3. Compare line-by-line with the original file to ensure nothing is lost
4. Replace the original file (not create a .new.test.ts file)
5. Update testCase ID to match original (e.g., "basic2" not "basic2-new")

After migration, run: `bun test [FILE_PATH]` to verify all tests pass.
```

## Progress Summary
- **Total Files**: 30
- **Migrated**: 8 (27%)
- **In Progress**: 0 (0%)
- **Remaining**: 22 (73%)

## Notes
- Start with basic tests (basic2-10) as they're simpler
- Downgrade and upgrade tests may be more complex
- Archived tests may not need migration
- Each migration should preserve ALL test logic and assertions
