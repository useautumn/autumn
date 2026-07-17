import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

export const fullSubjectToApiCustomerProducts = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullCusProduct[] =>
	fullSubject.subjectType === "entity"
		? [
				...fullSubject.customer_products,
				// ...(fullSubject.aggregated_customer_products ?? []),
			]
		: [
				...fullSubject.customer_products,
				...(fullSubject.aggregated_customer_products ?? []),
			];
// : fullSubjectToPlanProducts({ fullSubject });
