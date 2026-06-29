import type { ApiCustomerV5 } from "../../api/customers/apiCustomerV5.js";
import type { ApiEntityV2 } from "../../api/entities/apiEntityV2.js";
import type {
	BillingControlKey,
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageLimit,
} from "../../models/cusModels/billingControls/customerBillingControls.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { resolveBillingControl } from "./planBillingControlUtils.js";

const mergeControlsByFeature = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>({
	entityControls,
	customerControls,
	planCustomerProducts,
	controlKey,
	normalizeForCompare,
}: {
	entityControls: TControl[];
	customerControls: TControl[];
	planCustomerProducts: FullCusProduct[];
	controlKey: TKey;
	normalizeForCompare?: (control: TControl) => TControl;
}): TControl[] => {
	const inheritedFeatureIds = new Set(
		entityControls
			.map((entry) => entry.feature_id)
			.filter((id): id is string => !!id),
	);

	const inheritedCustomerControls = customerControls.filter((entry) => {
		if (!entry.feature_id || inheritedFeatureIds.has(entry.feature_id)) {
			return false;
		}

		inheritedFeatureIds.add(entry.feature_id);
		return true;
	});

	const planFeatureIds = [
		...new Set(
			planCustomerProducts.flatMap(
				(customerProduct) =>
					(
						customerProduct.product?.[controlKey] as
							| TControl[]
							| null
							| undefined
					)?.map((entry) => entry.feature_id) ?? [],
			),
		),
	].filter((id): id is string => !!id && !inheritedFeatureIds.has(id));

	const planControls = planFeatureIds.flatMap((featureId) => {
		const control = resolveBillingControl<TControl, TKey>({
			controlLists: [],
			customerProducts: planCustomerProducts,
			controlKey,
			matches: (entry) => entry.feature_id === featureId,
			normalizeForCompare,
		});

		return control ? [control] : [];
	});

	return [...entityControls, ...inheritedCustomerControls, ...planControls];
};

/**
 * Build a new entity apiSubject whose billing_controls inherit customer and
 * plan spend_limits, usage_limits and overage_allowed entries per feature_id.
 * Entity's own entry always wins per feature; customer, then plan fill gaps.
 *
 * Used at check time so `apiSubjectToSpendLimit` / `apiSubjectToUsageLimitHeadroom`
 * / `apiSubjectToOverageAllowedControl` (which read from `subject.billing_controls`)
 * see the inherited controls without needing to know about the customer separately.
 *
 * Pure — does not mutate inputs.
 */
export const mergeCustomerBillingControlsForCheck = ({
	entityApiSubject,
	customerApiSubject,
	planCustomerProducts = [],
	normalizeSpendLimitForCompare,
}: {
	entityApiSubject: ApiEntityV2;
	customerApiSubject: ApiCustomerV5;
	planCustomerProducts?: FullCusProduct[];
	/**
	 * Optional projection that resolves a percentage-typed spend limit to an
	 * absolute one so the most-restrictive merge across plans can compare
	 * percent and absolute caps on the same axis. Pass when callers have the
	 * customer's main-plan allowance available (typically via
	 * `fullCustomerToCustomerEntitlements` + `resolveSpendLimitOverageLimit`).
	 */
	normalizeSpendLimitForCompare?: (control: DbSpendLimit) => DbSpendLimit;
}): ApiEntityV2 => {
	const entitySpendLimits =
		entityApiSubject.billing_controls?.spend_limits ?? [];
	const entityUsageLimits =
		entityApiSubject.billing_controls?.usage_limits ?? [];
	const entityOverageAllowed =
		entityApiSubject.billing_controls?.overage_allowed ?? [];
	const customerSpendLimits =
		customerApiSubject.billing_controls?.spend_limits ?? [];
	const customerUsageLimits =
		customerApiSubject.billing_controls?.usage_limits ?? [];
	const customerOverageAllowed =
		customerApiSubject.billing_controls?.overage_allowed ?? [];
	const spendLimits = mergeControlsByFeature<DbSpendLimit, "spend_limits">({
		entityControls: entitySpendLimits,
		customerControls: customerSpendLimits,
		planCustomerProducts,
		controlKey: "spend_limits",
		normalizeForCompare: normalizeSpendLimitForCompare,
	});
	const usageLimits = mergeControlsByFeature<DbUsageLimit, "usage_limits">({
		entityControls: entityUsageLimits,
		customerControls: customerUsageLimits,
		planCustomerProducts,
		controlKey: "usage_limits",
	});
	const overageAllowed = mergeControlsByFeature<
		DbOverageAllowed,
		"overage_allowed"
	>({
		entityControls: entityOverageAllowed,
		customerControls: customerOverageAllowed,
		planCustomerProducts,
		controlKey: "overage_allowed",
	});

	if (
		spendLimits.length === entitySpendLimits.length &&
		usageLimits.length === entityUsageLimits.length &&
		overageAllowed.length === entityOverageAllowed.length
	) {
		return entityApiSubject;
	}

	return {
		...entityApiSubject,
		billing_controls: {
			...entityApiSubject.billing_controls,
			spend_limits: spendLimits,
			usage_limits: usageLimits,
			overage_allowed: overageAllowed,
		},
	};
};

export const mergePlanBillingControlsForCheck = ({
	customerApiSubject,
	planCustomerProducts = [],
	normalizeSpendLimitForCompare,
}: {
	customerApiSubject: ApiCustomerV5;
	planCustomerProducts?: FullCusProduct[];
	/**
	 * Optional projection that resolves a percentage-typed spend limit to an
	 * absolute one so the most-restrictive merge across plans can compare
	 * percent and absolute caps on the same axis.
	 */
	normalizeSpendLimitForCompare?: (control: DbSpendLimit) => DbSpendLimit;
}): ApiCustomerV5 => {
	const customerSpendLimits =
		customerApiSubject.billing_controls?.spend_limits ?? [];
	const customerUsageLimits =
		customerApiSubject.billing_controls?.usage_limits ?? [];
	const customerOverageAllowed =
		customerApiSubject.billing_controls?.overage_allowed ?? [];
	const spendLimits = mergeControlsByFeature<DbSpendLimit, "spend_limits">({
		entityControls: customerSpendLimits,
		customerControls: [],
		planCustomerProducts,
		controlKey: "spend_limits",
		normalizeForCompare: normalizeSpendLimitForCompare,
	});
	const usageLimits = mergeControlsByFeature<DbUsageLimit, "usage_limits">({
		entityControls: customerUsageLimits,
		customerControls: [],
		planCustomerProducts,
		controlKey: "usage_limits",
	});
	const overageAllowed = mergeControlsByFeature<
		DbOverageAllowed,
		"overage_allowed"
	>({
		entityControls: customerOverageAllowed,
		customerControls: [],
		planCustomerProducts,
		controlKey: "overage_allowed",
	});

	if (
		spendLimits.length === customerSpendLimits.length &&
		usageLimits.length === customerUsageLimits.length &&
		overageAllowed.length === customerOverageAllowed.length
	) {
		return customerApiSubject;
	}

	return {
		...customerApiSubject,
		billing_controls: {
			...customerApiSubject.billing_controls,
			spend_limits: spendLimits,
			usage_limits: usageLimits,
			overage_allowed: overageAllowed,
		},
	};
};
