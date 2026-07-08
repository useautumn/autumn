import type { DbSpendLimit } from "@models/cusModels/billingControls/spendLimit.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import {
	fullCustomerToPlanProducts,
	resolveBillingControl,
} from "../../fullSubjectUtils/planBillingControlUtils.js";

/**
 * Resolve whether overage billing is skipped for a feature (entity > customer > plan).
 * The nearest entry for the feature wins wholesale; undefined skip_overage_billing
 * means billed, so only an enabled entry with an explicit true skips.
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
		matches: (candidate) => candidate.feature_id === featureId,
	});

	return (
		spendLimit?.enabled === true && spendLimit.skip_overage_billing === true
	);
};
