import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import {
	fullCustomerToPlanProducts,
	resolveBillingControl,
} from "../../fullSubjectUtils/planBillingControlUtils.js";

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

	const spendLimit = resolveBillingControl({
		controlLists: [entity?.spend_limits ?? [], fullCustomer.spend_limits ?? []],
		customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
		controlKey: "spend_limits",
		matches: (candidate) => candidate.feature_id === featureId,
	});

	return (
		spendLimit?.enabled === true && spendLimit.skip_overage_billing === true
	);
};
