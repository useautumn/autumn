import type { ApiCustomerV5 } from "../../api/customers/apiCustomerV5.js";
import type { ApiEntityV2 } from "../../api/entities/apiEntityV2.js";
import type {
	BillingControlKey,
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageLimit,
} from "../../models/cusModels/billingControls/customerBillingControls.js";
import { usageLimitFilterKey } from "../../models/cusModels/billingControls/usageLimit.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { getCurrentUsageWindowUsage } from "../usageWindowUtils/getCurrentUsageWindowUsage.js";
import { fullSubjectToUsageWindowLimits } from "./fullSubjectToUsageWindowLimits.js";
import { resolveBillingControl } from "./planBillingControlUtils.js";

/** Usage limits are identified per (feature, filter); other controls per feature. */
export const usageLimitIdentity = (entry: DbUsageLimit): string =>
	`${entry.feature_id}|${usageLimitFilterKey(entry.filter)}`;

export const mergeControlsByFeature = <
	TControl extends { feature_id?: string },
	TKey extends BillingControlKey,
>({
	entityControls,
	customerControls,
	planCustomerProducts,
	controlKey,
	normalizeForCompare,
	identityOf,
}: {
	entityControls: TControl[];
	customerControls: TControl[];
	planCustomerProducts: FullCusProduct[];
	controlKey: TKey;
	normalizeForCompare?: (control: TControl) => TControl;
	/** Inheritance identity; defaults to feature_id. */
	identityOf?: (control: TControl) => string | undefined;
}): TControl[] => {
	const identity = identityOf ?? ((entry: TControl) => entry.feature_id);
	const inheritedIdentities = new Set(
		entityControls
			.map((entry) => identity(entry))
			.filter((id): id is string => !!id),
	);

	const inheritedCustomerControls = customerControls.filter((entry) => {
		const entryIdentity = identity(entry);
		if (!entryIdentity || inheritedIdentities.has(entryIdentity)) {
			return false;
		}

		inheritedIdentities.add(entryIdentity);
		return true;
	});

	const planIdentities = [
		...new Set(
			planCustomerProducts.flatMap(
				(customerProduct) =>
					(
						customerProduct.product?.[controlKey] as
							| TControl[]
							| null
							| undefined
					)?.map((entry) => identity(entry)) ?? [],
			),
		),
	].filter((id): id is string => !!id && !inheritedIdentities.has(id));

	const planControls = planIdentities.flatMap((planIdentity) => {
		const control = resolveBillingControl<TControl, TKey>({
			controlLists: [],
			customerProducts: planCustomerProducts,
			controlKey,
			matches: (entry) => identity(entry) === planIdentity,
			normalizeForCompare,
		});

		return control ? [control] : [];
	});

	return [...entityControls, ...inheritedCustomerControls, ...planControls];
};

/**
 * A plan-derived usage_limits entry (from mergeControlsByFeature's
 * planControls) is raw product config with no `usage` -- unlike
 * entity/customer-owned entries, which fullSubjectToApiUsageLimits already
 * decorated upstream. Fill in just the missing ones from the live
 * usage-window counters, so a plan-only cap can gate `check`.
 */
export const decorateInheritedPlanUsageLimits = <
	TUsageLimit extends DbUsageLimit,
>({
	usageLimits,
	fullSubject,
	features,
}: {
	usageLimits: TUsageLimit[];
	fullSubject?: FullSubject;
	features?: Feature[];
}): TUsageLimit[] => {
	const undecorated = usageLimits.filter(
		(usageLimit) => !("usage" in usageLimit),
	);
	if (!fullSubject || !features || undecorated.length === 0) {
		return usageLimits;
	}

	const now = Date.now();
	const resolvedLimits = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: undecorated.map((usageLimit) => usageLimit.feature_id),
		features,
		now,
	});
	const usageWindows = fullSubject.usage_windows ?? [];

	return usageLimits.map((usageLimit) => {
		if ("usage" in usageLimit) return usageLimit;

		const filterKey = usageLimitFilterKey(usageLimit.filter);
		const resolved = resolvedLimits.find(
			(limit) =>
				limit.feature_id === usageLimit.feature_id &&
				(limit.filter_key || "") === filterKey,
		);
		if (!resolved) return usageLimit;

		return {
			...usageLimit,
			usage: getCurrentUsageWindowUsage({ usageWindows, limit: resolved, now }),
		};
	});
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
	fullSubject,
	features,
}: {
	entityApiSubject: ApiEntityV2;
	customerApiSubject: ApiCustomerV5;
	planCustomerProducts?: FullCusProduct[];
	/** Normalizes spend limits only for most-restrictive plan comparisons. */
	normalizeSpendLimitForCompare?: (control: DbSpendLimit) => DbSpendLimit;
	/** When provided (with `features`), a plan-inherited usage_limits entry is
	 *  decorated with its current window `usage`. */
	fullSubject?: FullSubject;
	features?: Feature[];
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
	const usageLimits = decorateInheritedPlanUsageLimits({
		usageLimits: mergeControlsByFeature<DbUsageLimit, "usage_limits">({
			entityControls: entityUsageLimits,
			customerControls: customerUsageLimits,
			planCustomerProducts,
			controlKey: "usage_limits",
			identityOf: usageLimitIdentity,
		}),
		fullSubject,
		features,
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
	fullSubject,
	features,
}: {
	customerApiSubject: ApiCustomerV5;
	planCustomerProducts?: FullCusProduct[];
	/** Normalizes spend limits only for most-restrictive plan comparisons. */
	normalizeSpendLimitForCompare?: (control: DbSpendLimit) => DbSpendLimit;
	/** When provided (with `features`), a plan-inherited usage_limits entry is
	 *  decorated with its current window `usage`. */
	fullSubject?: FullSubject;
	features?: Feature[];
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
	const usageLimits = decorateInheritedPlanUsageLimits({
		usageLimits: mergeControlsByFeature<DbUsageLimit, "usage_limits">({
			entityControls: customerUsageLimits,
			customerControls: [],
			planCustomerProducts,
			controlKey: "usage_limits",
			identityOf: usageLimitIdentity,
		}),
		fullSubject,
		features,
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
