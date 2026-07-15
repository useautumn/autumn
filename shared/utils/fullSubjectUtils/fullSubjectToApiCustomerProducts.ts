import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { fullSubjectToPlanProducts } from "./planBillingControlUtils.js";

export const fullSubjectToApiCustomerProducts = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullCusProduct[] => fullSubjectToPlanProducts({ fullSubject });
