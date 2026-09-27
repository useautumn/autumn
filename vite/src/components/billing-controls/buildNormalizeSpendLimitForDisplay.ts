import {
	type DbSpendLimit,
	DEFAULT_PLAN_CONTROL_STATUSES,
	type Entity,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	resolveSpendLimitOverageLimit,
} from "@autumn/shared";

/** Mirrors the normalizer in `fullCustomerToSpendLimitByFeatureId`: percentage caps become units. */
export const buildNormalizeSpendLimitForDisplay = ({
	fullCustomer,
	entity,
}: {
	fullCustomer: FullCustomer;
	entity?: Entity;
}) => {
	const entityId = entity?.id ?? entity?.internal_id ?? undefined;

	return (control: DbSpendLimit): DbSpendLimit => {
		if (control.limit_type !== "usage_percentage" || !control.feature_id) {
			return control;
		}
		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureIds: [control.feature_id],
			entity,
			inStatuses: DEFAULT_PLAN_CONTROL_STATUSES,
		});
		return {
			...control,
			overage_limit: resolveSpendLimitOverageLimit({
				spendLimit: control,
				cusEnts,
				entityId,
			}),
			limit_type: "absolute",
		};
	};
};
