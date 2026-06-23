import type { BillingControlKey } from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";

const DEFAULT_PLAN_CONTROL_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
];

const appliesNow = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) =>
	(customerProduct.starts_at ?? 0) <= now &&
	(customerProduct.access_starts_at ?? customerProduct.starts_at ?? 0) <= now &&
	(customerProduct.ended_at == null || customerProduct.ended_at > now);

export const getPlanBillingControlProducts = ({
	customerProducts,
	now = Date.now(),
	inStatuses = DEFAULT_PLAN_CONTROL_STATUSES,
}: {
	customerProducts: FullCusProduct[];
	now?: number;
	inStatuses?: CusProductStatus[];
}) =>
	customerProducts
		.filter(
			(customerProduct) =>
				inStatuses.includes(customerProduct.status) &&
				appliesNow({ customerProduct, now }),
		)
		.sort(
			(left, right) =>
				(right.created_at ?? 0) - (left.created_at ?? 0) ||
				(right.starts_at ?? 0) - (left.starts_at ?? 0) ||
				right.id.localeCompare(left.id),
		);

export const findPlanBillingControl = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>({
	customerProducts,
	controlKey,
	matches,
	now,
	inStatuses,
}: {
	customerProducts: FullCusProduct[];
	controlKey: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
}): TControl | undefined => {
	for (const customerProduct of getPlanBillingControlProducts({
		customerProducts,
		now,
		inStatuses,
	})) {
		const controls = customerProduct[controlKey] as TControl[] | null | undefined;
		const control = controls?.find(matches);
		if (control) return control;
	}
};

export const resolveBillingControl = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>({
	controlLists,
	customerProducts,
	controlKey,
	matches,
	now,
	inStatuses,
}: {
	controlLists: Array<TControl[] | null | undefined>;
	customerProducts?: FullCusProduct[];
	controlKey?: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
}) => {
	for (const controls of controlLists) {
		const control = controls?.find(matches);
		if (control) return control;
	}

	if (!customerProducts || !controlKey) return undefined;

	return findPlanBillingControl<TControl, TKey>({
		customerProducts,
		controlKey,
		matches,
		now,
		inStatuses,
	});
};

export const fullSubjectToPlanProducts = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}) => [
	...fullSubject.customer_products,
	...(fullSubject.aggregated_customer_products ?? []),
];

export const fullCustomerToPlanProducts = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) => fullCustomer.customer_products ?? [];
