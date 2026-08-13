import type { EntitlementWithFeature, Feature } from "@autumn/shared";
import type { CustomerPlanChange } from "@autumn/shared/api/billing/common/customerPlanChange.js";
import { toCustomerPlanSnapshotFromFields } from "@/internal/billing/v2/actions/buildBillingChanges";
import { buildItemChanges } from "../buildMigrationItemEvent/buildAddedPlanChanges.js";
import type { ChangedItem } from "./buildBatchMigrationWebhookRecords.js";

/** One customer product's inserted rows → one `updated` plan change: the
 * lifecycle snapshot off the rows plus `created` item changes. */
export const insertedItemsToPlanChange = ({
	items,
	isOneOff,
	entitlementLookup,
	features,
}: {
	items: ChangedItem[];
	isOneOff: boolean;
	entitlementLookup: Map<string, EntitlementWithFeature>;
	features: Feature[];
}): CustomerPlanChange | null => {
	const [first] = items;
	if (!first) return null;

	const changes = items.flatMap((item) => {
		const entitlement =
			item.action === "deleted"
				? item.entitlement
				: entitlementLookup.get(`${item.planId}:${item.featureId}`);
		return entitlement ? [{ entitlement, action: item.action }] : [];
	});
	if (changes.length === 0) return null;

	return {
		action: "updated" as const,
		...toCustomerPlanSnapshotFromFields({
			planId: first.planId,
			status: first.status,
			isOneOff,
			startsAt: first.startsAt,
			canceledAt: first.canceledAt,
			endedAt: first.endedAt,
			trialEndsAt: first.trialEndsAt,
		}),
		previous_attributes: {},
		item_changes: buildItemChanges({ changes, features }),
	};
};
