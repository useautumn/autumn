import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels";
import { AllowanceType } from "../../models/productModels/entModels/entModels";

export const isUnlimitedCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return cusEnt.entitlement.allowance_type === AllowanceType.Unlimited;
};
