import {
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
	return backdates && liveSubscriptionTrialing;
};

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
