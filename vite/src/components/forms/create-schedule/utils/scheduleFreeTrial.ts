import {
	backdateAcceptsFreeTrial,
	CusProductStatus,
	customerProductHasActiveStatus,
	type FreeTrial,
	FreeTrialDuration,
	type FreeTrialParamsV1,
	type FullCusProduct,
	getRemainingTrialDays,
	isCustomerProductTrialing,
	isPastStartDate,
	type ProductV2,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import {
	DISABLED_FREE_TRIAL_FORM_VALUES,
	type FreeTrialFormValues,
	freeTrialFormValuesToParams,
	freeTrialToFormValues,
	isSameFreeTrialFormValues,
} from "@/components/forms/shared/utils/freeTrialFormValues";

export type CurrentScheduleTrial = {
	trialEndsAt: number;
	formValues: FreeTrialFormValues;
};

const isLiveCustomerProduct = (customerProduct: FullCusProduct) =>
	customerProductHasActiveStatus(customerProduct) ||
	customerProduct.status === CusProductStatus.Trialing;

const currentTrialFormValues = ({
	customerProduct,
	trialEndsAt,
}: {
	customerProduct: FullCusProduct;
	trialEndsAt: number;
}): FreeTrialFormValues => {
	if (customerProduct.free_trial) {
		return freeTrialToFormValues({ freeTrial: customerProduct.free_trial });
	}
	return {
		trialEnabled: true,
		trialLength: getRemainingTrialDays({ trialEndsAt }),
		trialDuration: FreeTrialDuration.Day,
		trialCardRequired: true,
	};
};

/** The trial a live plan of the edited subscription is running now, if any. */
export const findCurrentScheduleTrial = ({
	customerProducts,
	nowMs,
}: {
	customerProducts: FullCusProduct[];
	nowMs: number;
}): CurrentScheduleTrial | null => {
	const trialingCustomerProduct = customerProducts.find(
		(customerProduct) =>
			isLiveCustomerProduct(customerProduct) &&
			isCustomerProductTrialing(customerProduct, { nowMs }),
	);
	const trialEndsAt = trialingCustomerProduct?.trial_ends_at;
	if (!trialingCustomerProduct || !trialEndsAt) return null;

	return {
		trialEndsAt,
		formValues: currentTrialFormValues({
			customerProduct: trialingCustomerProduct,
			trialEndsAt,
		}),
	};
};

/** A first-phase plan's catalog trial, which set_plans starts when `free_trial` is omitted and the customer never had the plan. */
export const findCatalogScheduleTrial = ({
	phases,
	products,
	customerProducts,
}: {
	phases: CustomerStatePhase[];
	products: ProductV2[];
	customerProducts: FullCusProduct[];
}): FreeTrial | null => {
	const heldProductIds = new Set(
		customerProducts.map((customerProduct) => customerProduct.product.id),
	);
	for (const plan of phases[0]?.plans ?? []) {
		const product = products.find(({ id }) => id === plan.productId);
		if (product?.free_trial && !heldProductIds.has(product.id)) {
			return product.free_trial as FreeTrial;
		}
	}
	return null;
};

/** What the row shows before the user touches it: the running trial, else the catalog trial set_plans would start. */
export const defaultScheduleTrialFormValues = ({
	currentTrial,
	catalogFreeTrial,
}: {
	currentTrial: CurrentScheduleTrial | null;
	catalogFreeTrial: FreeTrial | null;
}): FreeTrialFormValues => {
	if (currentTrial) return currentTrial.formValues;
	if (catalogFreeTrial) {
		return freeTrialToFormValues({ freeTrial: catalogFreeTrial });
	}
	return DISABLED_FREE_TRIAL_FORM_VALUES;
};

/** set_plans rejects a trial when the first phase starts later, or backdates a subscription that isn't trialing. */
export const canScheduleFreeTrial = ({
	phases,
	nowMs,
	liveSubscriptionTrialing,
}: {
	phases: CustomerStatePhase[];
	nowMs: number;
	liveSubscriptionTrialing: boolean;
}) => {
	const firstPhase = phases[0];
	if (!firstPhase) return false;
	if (firstPhase.persistedStartsAt != null) {
		return firstPhase.persistedStartsAt <= nowMs;
	}
	if (firstPhase.startsAt === null) return true;

	const backdates = isPastStartDate(
		firstPhase.startsAt,
		nowMs,
		SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	);
	return backdates && backdateAcceptsFreeTrial({ liveSubscriptionTrialing });
};

/** Switching a running trial off on a first phase starting now ends it now (set_plans' `free_trial: null`). */
export const endsCurrentTrialNow = ({
	phases,
	nowMs,
	formValues,
	currentTrial,
}: {
	phases: CustomerStatePhase[];
	nowMs: number;
	formValues: Pick<FreeTrialFormValues, "trialEnabled">;
	currentTrial: CurrentScheduleTrial | null;
}) =>
	currentTrial !== null &&
	!formValues.trialEnabled &&
	canScheduleFreeTrial({ phases, nowMs, liveSubscriptionTrialing: true });

/**
 * Untouched, a running trial is omitted so set_plans carries it on. Switched off, null ends a running
 * trial or skips the catalog trial set_plans would start; with neither, `free_trial` is omitted.
 */
export const scheduleFreeTrialParam = ({
	formValues,
	currentTrial,
	catalogFreeTrial,
}: {
	formValues: FreeTrialFormValues;
	currentTrial: CurrentScheduleTrial | null;
	catalogFreeTrial: FreeTrial | null;
}): FreeTrialParamsV1 | null | undefined => {
	if (!formValues.trialEnabled) {
		return currentTrial || catalogFreeTrial ? null : undefined;
	}
	const keepsCurrentTrial =
		currentTrial !== null &&
		isSameFreeTrialFormValues({
			left: formValues,
			right: currentTrial.formValues,
		});
	if (keepsCurrentTrial) return undefined;
	return freeTrialFormValuesToParams(formValues);
};

/** A plan change re-seeds the row with its new default, unless the user has edited the row. */
export const reseededScheduleTrialFormValues = ({
	trialEdited,
	previousDefaultFormValues,
	defaultFormValues,
}: {
	trialEdited: boolean;
	previousDefaultFormValues: FreeTrialFormValues;
	defaultFormValues: FreeTrialFormValues;
}): FreeTrialFormValues | null => {
	if (trialEdited) return null;
	const defaultChanged = !isSameFreeTrialFormValues({
		left: previousDefaultFormValues,
		right: defaultFormValues,
	});
	return defaultChanged ? defaultFormValues : null;
};
