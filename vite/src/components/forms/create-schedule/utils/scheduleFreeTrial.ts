import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FreeTrial,
	FreeTrialDuration,
	type FreeTrialParamsV1,
	type FullCusProduct,
	getRemainingTrialDays,
	isCustomerProductTrialing,
	type ProductV2,
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

/** set_plans rejects a trial when the first phase starts later or is backdated. */
export const canScheduleFreeTrial = ({
	phases,
	nowMs,
}: {
	phases: CustomerStatePhase[];
	nowMs: number;
}) => {
	const firstPhase = phases[0];
	if (!firstPhase) return false;
	if (firstPhase.persistedStartsAt != null) {
		return firstPhase.persistedStartsAt <= nowMs;
	}
	return firstPhase.startsAt === null;
};

/**
 * Untouched, a running trial is omitted so set_plans carries it on; switched off it is ended with null.
 * Without a running trial, a disabled row omits `free_trial` entirely.
 */
export const scheduleFreeTrialParam = ({
	formValues,
	currentTrial,
}: {
	formValues: FreeTrialFormValues;
	currentTrial: CurrentScheduleTrial | null;
}): FreeTrialParamsV1 | null | undefined => {
	if (!formValues.trialEnabled) return currentTrial ? null : undefined;
	const keepsCurrentTrial =
		currentTrial !== null &&
		isSameFreeTrialFormValues({
			left: formValues,
			right: currentTrial.formValues,
		});
	if (keepsCurrentTrial) return undefined;
	return freeTrialFormValuesToParams(formValues);
};
