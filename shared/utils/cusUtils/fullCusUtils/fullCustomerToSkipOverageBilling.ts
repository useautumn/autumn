import type { DbSpendLimit } from "@models/cusModels/billingControls/spendLimit.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import {
	fullCustomerToPlanProducts,
	resolveBillingControl,
} from "../../fullSubjectUtils/planBillingControlUtils.js";

/**
 * Resolve whether overage billing is skipped for a feature (entity > customer > plan).
 * Only spend_limit entries that define skip_overage_billing participate, so a
 * customer entry that only sets an overage cap doesn't shadow a plan-level skip.
 */
export const fullCustomerToSkipOverageBilling = ({
	fullCustomer,
	featureId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	internalEntityId?: string;
}): boolean => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;

	const spendLimit = resolveBillingControl<DbSpendLimit, "spend_limits">({
		controlLists: [entity?.spend_limits ?? [], fullCustomer.spend_limits ?? []],
		customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
		controlKey: "spend_limits",
		matches: (candidate) =>
			candidate.feature_id === featureId &&
			candidate.skip_overage_billing !== undefined,
	});

	if (!spendLimit?.enabled) return false;

	return spendLimit.skip_overage_billing === true;
};
