import { customerEntitlementFundsFeature } from "@autumn/shared";
import type { Catalog } from "../../models/catalog/catalog.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { filterCatalogForState } from "../catalogUtils/filterCatalogUtils.js";

export const slimSubjectForFeatures = ({
	state,
	catalog,
	featureIds,
}: {
	state: SubjectState;
	catalog: Catalog;
	featureIds: string[];
}): { state: SubjectState; catalog: Catalog } => {
	const customerEntitlements = state.customerEntitlements.filter((row) => {
		const entitlement = catalog.entitlements[row.entitlement_id];
		const feature = catalog.features[row.internal_feature_id];
		if (!entitlement || !feature) return true;
		const customerEntitlement = { entitlement: { ...entitlement, feature } };
		return featureIds.some((featureId) =>
			customerEntitlementFundsFeature({ customerEntitlement, featureId }),
		);
	});
	const keptRowIds = new Set(customerEntitlements.map((row) => row.id));
	const slimState: SubjectState = {
		...state,
		customerEntitlements,
		rollovers: state.rollovers.filter((row) => keptRowIds.has(row.cus_ent_id)),
		replaceables: state.replaceables.filter((row) =>
			keptRowIds.has(row.cus_ent_id),
		),
		openLocks: [],
	};
	return {
		state: slimState,
		catalog: filterCatalogForState({ state: slimState, catalog }),
	};
};
