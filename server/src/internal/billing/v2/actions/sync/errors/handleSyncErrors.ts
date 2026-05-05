import type { SyncBillingContext } from "@autumn/shared";

/**
 * Validate sync inputs against the detection result. Throws RecaseError on
 * any unrecoverable problem; otherwise no-op.
 *
 * STUB — checks to add later:
 *   - Mapping plan_ids exist in the catalog
 *   - Each mapping points at a stripe sub/schedule we actually fetched
 *   - Detection PlanWarnings are all in `acknowledgedWarnings`
 *   - Customer has a Stripe id
 */
export const handleSyncErrors = (_args: {
	syncContext: SyncBillingContext;
}): void => {
	// no-op
};
