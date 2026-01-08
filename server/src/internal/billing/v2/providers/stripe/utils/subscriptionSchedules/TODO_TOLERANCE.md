# TODO: Transition Point Tolerance

## Problem
When building schedule phases, we may have situations where `end_date` of one phase and `start_date` of another phase are very close but not exactly equal (e.g., due to timing differences, rounding, or slight delays in processing).

For example:
- Phase 1 ends at `1704067199000` (Dec 31, 2023 23:59:59)
- Phase 2 starts at `1704067200000` (Jan 1, 2024 00:00:00)

These should be considered the same transition point, but currently they'd create separate phases.

## Proposed Solution
Add a tolerance parameter (e.g., 60 seconds or 1 minute) when building transition points:
- When collecting transition points, merge points that are within tolerance of each other
- Use the earlier timestamp as the canonical transition point

## Implementation
1. Add `toleranceMs` parameter to `buildTransitionPoints` (default: 60000ms = 1 minute)
2. After collecting all timestamps, sort and merge those within tolerance
3. When merging, prefer the earlier timestamp

## Tests to Write
1. **Exact match**: Two transitions at exactly the same time → single transition point
2. **Within tolerance**: Two transitions 30 seconds apart → merged to single transition point  
3. **Outside tolerance**: Two transitions 2 minutes apart → two separate transition points
4. **Multiple close transitions**: 3 transitions within 1 minute → all merged to single point
5. **Mixed**: Some within tolerance, some outside → correct merging behavior
6. **Edge case**: Transition at tolerance boundary (exactly 60 seconds apart)

## Files to Modify
- `buildTransitionPoints.ts` - Add tolerance logic
- `buildStripePhasesUpdate.ts` - Pass tolerance parameter if needed
- `build-schedule-phases.test.ts` - Add tolerance-specific tests
