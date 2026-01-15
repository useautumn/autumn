# ENG-952: Update Subscription Frontend - TODO

## Missing Features

### Critical
- [x] **Preview Error Display** - Show red error box for preview endpoint errors (DONE)

### High Priority
- [x] **Plan Version Selector** - Dropdown to select product version (DONE)
- [x] **Edit Plan / Customization** - Edit plan button navigates to plan editor, syncs items to form (DONE)
- [x] **Update Preview Hook** - Add `items` and `version` parameters to preview hook (DONE)

### Medium Priority
- [x] **Enhanced Change Display** - Version change notification in `UpdateSubscriptionSummary.tsx` (DONE)
- [x] **Item Change Display** - Item changes shown in summary with detailed diff (DONE)

---

## Files Created
- [x] `PlanVersionSection.tsx`
- [x] `generateVersionChanges.ts`
- [x] `EditPlanSection.tsx` - Edit Plan Items button
- [x] `generateItemChanges.ts` - Item diff utility
- [x] `useItemsSync.ts` - Sync customizedProduct to form
- [x] `PreviewErrorDisplay.tsx`

## Files Modified
- [x] `updateSubscriptionFormSchema.ts` - add version field, items field
- [x] `useUpdateSubscriptionForm.ts` - add version default, items: null
- [x] `useUpdateSubscriptionRequestBody.ts` - add version and items to body
- [x] `UpdateSubscriptionSummary.tsx` - version changes, item changes
- [x] `SummaryItemRow.tsx` - version icon, item icon
- [x] `types/summary.ts` - add version and item types
- [x] `SubscriptionUpdateSheet2.tsx` - fetch numVersions, render PlanVersionSection, EditPlanSection, useItemsSync
- [x] `index.ts` - export new components
- [x] `use-update-subscription-preview.ts` - add items and version params
- [x] `UpdateSubscriptionPreviewSection.tsx` - render errors

---

## Open Questions
- [x] Should version changes allow downgrade or only upgrade? **ANSWERED: Both directions allowed**
- [ ] Show confirmation dialog when removing free trial?
- [ ] Should preview errors block submit or just show warning?
- [ ] UI pattern for new inputs: stacked sections vs accordion vs tabs?
