import type {
	BillingControlKey,
	DbBillingControls,
} from "../../models/cusModels/billingControls/customerBillingControls.js";
import { pickStricterOverageAllowed } from "../../models/cusModels/billingControls/overageAllowed.js";
import { pickStricterSpendLimit } from "../../models/cusModels/billingControls/spendLimit.js";
import { pickStricterUsageLimit } from "../../models/cusModels/billingControls/usageLimit.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type {
	CusProduct,
	FullCusProduct,
} from "../../models/cusProductModels/cusProductModels.js";
import type { Product } from "../../models/productModels/productModels.js";

/** The control row each key holds, so a caller names the key and the control type follows. */
export type BillingControlByKey = {
	[K in BillingControlKey]: NonNullable<DbBillingControls[K]>[number];
};

type Comparator = (left: never, right: never) => unknown;

const MOST_RESTRICTIVE_BY_KEY: Partial<Record<BillingControlKey, Comparator>> =
	{
		usage_limits: pickStricterUsageLimit as Comparator,
		spend_limits: pickStricterSpendLimit as Comparator,
		overage_allowed: pickStricterOverageAllowed as Comparator,
	};

/** What resolving a plan control reads of a customer product; FullCusProduct and the balance worker's leaner row both qualify. */
export type PlanControlCustomerProduct = Pick<
	CusProduct,
	| "id"
	| "status"
	| "created_at"
	| "starts_at"
	| "access_starts_at"
	| "ended_at"
	| "customer_license_link_id"
	| "internal_entity_id"
	| "billing_cycle_anchor_resets_at"
> & { product: Pick<Product, BillingControlKey> };

export const DEFAULT_PLAN_CONTROL_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
];

const appliesNow = ({
	customerProduct,
	now,
}: {
	customerProduct: PlanControlCustomerProduct;
	now: number;
}) => {
	// Active statuses are authoritative when Stripe test clocks run ahead.
	const statusAwareNow = Math.max(now, customerProduct.starts_at ?? now);
	return (
		(customerProduct.access_starts_at ?? customerProduct.starts_at ?? 0) <=
			statusAwareNow &&
		(customerProduct.ended_at == null ||
			customerProduct.ended_at > statusAwareNow)
	);
};

export const getPlanBillingControlProducts = <
	CP extends PlanControlCustomerProduct,
>({
	customerProducts,
	now = Date.now(),
	inStatuses = DEFAULT_PLAN_CONTROL_STATUSES,
}: {
	customerProducts: CP[];
	now?: number;
	inStatuses?: CusProductStatus[];
}) =>
	customerProducts
		.filter(
			(customerProduct) =>
				(customerProduct.customer_license_link_id == null ||
					customerProduct.internal_entity_id == null) &&
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
	TKey extends BillingControlKey,
	TControl extends { feature_id?: string } = BillingControlByKey[TKey],
	CP extends PlanControlCustomerProduct = FullCusProduct,
>({
	customerProducts,
	controlKey,
	matches,
	now,
	inStatuses,
	normalizeForCompare,
}: {
	customerProducts: CP[];
	controlKey: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
	/** Projection used only for comparison; the original control is returned. */
	normalizeForCompare?: (control: TControl) => TControl;
}): { control: TControl; customerProduct: CP } | undefined => {
	const mostRestrictive = MOST_RESTRICTIVE_BY_KEY[controlKey] as
		| ((left: TControl, right: TControl) => TControl)
		| undefined;

	let winner: { control: TControl; customerProduct: CP } | undefined;
	let winnerNormalized: TControl | undefined;
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
		if (!winner) {
			winner = { control, customerProduct };
			winnerNormalized = normalizeForCompare?.(control) ?? control;
			continue;
		}
		const candidateNormalized = normalizeForCompare?.(control) ?? control;
		const stricter = mostRestrictive(
			winnerNormalized as TControl,
			candidateNormalized,
		);
		if (stricter !== winnerNormalized) {
			winner = { control, customerProduct };
			winnerNormalized = candidateNormalized;
		}
	}
	return winner;
};

export const findPlanBillingControl = <
	TKey extends BillingControlKey,
	TControl extends { feature_id?: string } = BillingControlByKey[TKey],
	CP extends PlanControlCustomerProduct = FullCusProduct,
>(args: {
	customerProducts: CP[];
	controlKey: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
	normalizeForCompare?: (control: TControl) => TControl;
}): TControl | undefined =>
	findPlanBillingControlWithProduct<TKey, TControl, CP>(args)?.control;

/**
 * Resolve a billing control and report which plan it came from.
 * `customerProduct` is undefined when the control resolved from `controlLists`
 * (entity/customer scope), set when it resolved from a plan's product columns.
 */
export const resolveBillingControlWithProduct = <
	TKey extends BillingControlKey,
	TControl extends { feature_id?: string } = BillingControlByKey[TKey],
	CP extends PlanControlCustomerProduct = FullCusProduct,
>({
	controlLists,
	customerProducts,
	controlKey,
	matches,
	now,
	inStatuses,
	normalizeForCompare,
}: {
	controlLists: Array<TControl[] | null | undefined>;
	customerProducts?: CP[];
	controlKey?: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
	normalizeForCompare?: (control: TControl) => TControl;
}): { control: TControl; customerProduct?: CP } | undefined => {
	for (const controls of controlLists) {
		const control = controls?.find(matches);
		if (control) return { control };
	}

	if (!customerProducts || !controlKey) return undefined;

	return findPlanBillingControlWithProduct<TKey, TControl, CP>({
		customerProducts,
		controlKey,
		matches,
		now,
		inStatuses,
		normalizeForCompare,
	});
};

export const resolveBillingControl = <
	TKey extends BillingControlKey,
	TControl extends { feature_id?: string } = BillingControlByKey[TKey],
	CP extends PlanControlCustomerProduct = FullCusProduct,
>(args: {
	controlLists: Array<TControl[] | null | undefined>;
	customerProducts?: CP[];
	controlKey?: TKey;
	matches: (control: TControl) => boolean;
	now?: number;
	inStatuses?: CusProductStatus[];
	normalizeForCompare?: (control: TControl) => TControl;
}) => resolveBillingControlWithProduct<TKey, TControl, CP>(args)?.control;

export const fullSubjectToPlanProducts = <
	CP extends PlanControlCustomerProduct,
>({
	fullSubject,
}: {
	fullSubject: { customer_products: CP[]; aggregated_customer_products?: CP[] };
}): CP[] =>
	[
		...fullSubject.customer_products,
		...(fullSubject.aggregated_customer_products ?? []),
	].filter(
		(customerProduct) =>
			customerProduct.customer_license_link_id == null ||
			customerProduct.internal_entity_id == null,
	);

export const fullCustomerToPlanProducts = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) =>
	(fullCustomer.customer_products ?? []).filter(
		(customerProduct) =>
			customerProduct.customer_license_link_id == null ||
			customerProduct.internal_entity_id == null,
	);
