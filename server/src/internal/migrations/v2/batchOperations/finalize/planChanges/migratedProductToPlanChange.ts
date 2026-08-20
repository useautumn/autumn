import {
	type CusProductStatus,
	type EntitlementWithFeature,
	type Feature,
	type FullProduct,
	type FullProductWithoutLicenses,
	isOneOffProduct,
	type PlanChangeV0,
} from "@autumn/shared";
import type { CustomerPlanChange } from "@autumn/shared/api/billing/common/customerPlanChange.js";
import { toCustomerPlanSnapshotFromFields } from "@/internal/billing/v2/actions/buildBillingChanges";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanChangeFromFullProducts.js";
import type { ChangedItem } from "./buildBatchMigrationPlanChanges.js";
import { buildItemChanges } from "./buildItemChanges.js";

type ProductLifecycle = {
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

const withEmptyLicenses = ({
	product,
}: {
	product: FullProductWithoutLicenses;
}): FullProduct => ({ ...product, licenses: [] });

const resolveAppliedEntitlements = ({
	appliedItems,
	entitlementLookup,
}: {
	appliedItems: ChangedItem[];
	entitlementLookup: Map<string, EntitlementWithFeature>;
}) =>
	appliedItems.flatMap((item) => {
		const entitlement =
			item.action === "deleted"
				? item.entitlement
				: entitlementLookup.get(`${item.planId}:${item.featureId}`);
		return entitlement ? [{ entitlement, action: item.action }] : [];
	});

const toMinimalPlanChange = ({
	itemChanges,
}: {
	itemChanges: PlanChangeV0["item_changes"];
}): PlanChangeV0 => ({
	previous_attributes: null,
	item_changes: itemChanges,
});

const toUpdatedCustomerPlanChange = ({
	planId,
	isOneOff,
	lifecycle,
	planChange,
}: {
	planId: string;
	isOneOff: boolean;
	lifecycle: ProductLifecycle;
	planChange?: PlanChangeV0;
}): CustomerPlanChange => ({
	action: "updated",
	...toCustomerPlanSnapshotFromFields({
		planId,
		status: lifecycle.status,
		isOneOff,
		startsAt: lifecycle.startsAt,
		canceledAt: lifecycle.canceledAt,
		endedAt: lifecycle.endedAt,
		trialEndsAt: lifecycle.trialEndsAt,
	}),
	previous_attributes: null,
	item_changes: [],
	...(planChange ? { plan_change: planChange } : {}),
});

/** One customer product's applied rows + optional version repoint → one
 * `updated` change. Item diffs live on plan_change; the top-level list is empty. */
export const migratedProductToPlanChange = ({
	planId,
	isOneOff,
	lifecycle,
	repoint,
	appliedItems,
	entitlementLookup,
	features,
}: {
	planId: string;
	isOneOff: boolean;
	lifecycle: ProductLifecycle;
	repoint?: {
		fromProduct: FullProductWithoutLicenses;
		toProduct: FullProductWithoutLicenses;
	};
	appliedItems: ChangedItem[];
	entitlementLookup: Map<string, EntitlementWithFeature>;
	features: Feature[];
}): CustomerPlanChange | undefined => {
	const itemChanges = buildItemChanges({
		changes: resolveAppliedEntitlements({ appliedItems, entitlementLookup }),
		features,
	});

	if (repoint) {
		const catalog = buildPlanChangeFromFullProducts({
			from: withEmptyLicenses({ product: repoint.fromProduct }),
			to: withEmptyLicenses({ product: repoint.toProduct }),
			features,
		});
		const planChange = catalog
			? { ...catalog, item_changes: itemChanges }
			: itemChanges.length > 0
				? toMinimalPlanChange({ itemChanges })
				: undefined;

		return toUpdatedCustomerPlanChange({
			planId: repoint.toProduct.id,
			isOneOff: isOneOffProduct(repoint.toProduct),
			lifecycle,
			planChange,
		});
	}

	if (itemChanges.length === 0) return undefined;

	return toUpdatedCustomerPlanChange({
		planId,
		isOneOff,
		lifecycle,
		planChange: toMinimalPlanChange({ itemChanges }),
	});
};
