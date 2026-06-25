import type { BillingControlKey } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { pickStricterOverageAllowed } from "../../models/cusModels/billingControls/overageAllowed.js";
import { pickStricterSpendLimit } from "../../models/cusModels/billingControls/spendLimit.js";
import { pickStricterUsageLimit } from "../../models/cusModels/billingControls/usageLimit.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

type Comparator = (left: never, right: never) => unknown;

const MOST_RESTRICTIVE_BY_KEY: Partial<Record<BillingControlKey, Comparator>> =
	{
		usage_limits: pickStricterUsageLimit as Comparator,
		spend_limits: pickStricterSpendLimit as Comparator,
		overage_allowed: pickStricterOverageAllowed as Comparator,
	};

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

export const findPlanBillingControlWithProduct = <
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
}): { control: TControl; customerProduct: FullCusProduct } | undefined => {
	const mostRestrictive = MOST_RESTRICTIVE_BY_KEY[controlKey] as
		| ((left: TControl, right: TControl) => TControl)
		| undefined;

	let winner: { control: TControl; customerProduct: FullCusProduct } | undefined;
	for (const customerProduct of getPlanBillingControlProducts({
		customerProducts,
		now,
		inStatuses,
	})) {
		const controls = customerProduct.product?.[controlKey] as
			| TControl[]
			| null
			| undefined;
		const control = controls?.find(matches);
		if (!control) continue;
		if (!mostRestrictive) return { control, customerProduct };
		winner =
			winner && mostRestrictive(winner.control, control) === winner.control
				? winner
				: { control, customerProduct };
	}
	return winner;
};

export const findPlanBillingControl = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>(args: {
	customerProducts: FullCusProduct[];
	controlKey: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
}): TControl | undefined =>
	findPlanBillingControlWithProduct<TControl, TKey>(args)?.control;

/**
 * Resolve a billing control and report which plan it came from.
 * `customerProduct` is undefined when the control resolved from `controlLists`
 * (entity/customer scope), set when it resolved from a plan's product columns.
 */
export const resolveBillingControlWithProduct = <
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
}): { control: TControl; customerProduct?: FullCusProduct } | undefined => {
	for (const controls of controlLists) {
		const control = controls?.find(matches);
		if (control) return { control };
	}

	if (!customerProducts || !controlKey) return undefined;

	return findPlanBillingControlWithProduct<TControl, TKey>({
		customerProducts,
		controlKey,
		matches,
		now,
		inStatuses,
	});
};

export const resolveBillingControl = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>(args: {
	controlLists: Array<TControl[] | null | undefined>;
	customerProducts?: FullCusProduct[];
	controlKey?: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
}) => resolveBillingControlWithProduct<TControl, TKey>(args)?.control;

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
