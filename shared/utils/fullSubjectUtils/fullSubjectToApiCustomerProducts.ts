import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

export const fullSubjectToApiCustomerProducts = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullCusProduct[] => {
	if (fullSubject.subjectType === "entity") {
		return fullSubject.customer_products;
	}

	return [
		...fullSubject.customer_products,
		...(fullSubject.aggregated_customer_products ?? []),
	];
};
