import type { Catalog } from "../../models/catalog/catalog.js";
import type { CustomerState } from "../../models/customerState.js";
import type { WorkerCustomerEntitlement } from "../../models/rows/workerCustomerEntitlement.js";
import { findFeatureById } from "../catalogUtils/findCatalogUtils.js";

/** Rows funding a feature, oldest first. */
export const findCustomerEntitlementsForFeature = ({
	state,
	catalog,
	featureId,
}: {
	state: CustomerState;
	catalog: Catalog;
	featureId: string;
}): WorkerCustomerEntitlement[] => {
	const feature = findFeatureById({ catalog, featureId });
	if (!feature) return [];

	return state.customerEntitlements
		.filter(
			(customerEntitlement) =>
				customerEntitlement.internal_feature_id === feature.internal_id,
		)
		.sort(
			(left, right) =>
				left.created_at - right.created_at || left.id.localeCompare(right.id),
		);
};
