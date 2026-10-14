import type { PlanTiming } from "@autumn/shared";
import {
	customerProductToEffectivePrices,
	type FullCustomer,
	type FullProduct,
	findMainActiveCustomerProductByGroup,
	findMainScheduledCustomerProductByGroup,
	isOneOffProduct,
	isProductUpgrade,
	productToEffectivePrices,
} from "@autumn/shared";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";

export const setupAttachTransitionContext = ({
	fullCustomer,
	attachProduct,
	planScheduleOverride,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
	planScheduleOverride?: PlanTiming;
	internalEntityId?: string;
}) => {
	const isMainRecurring =
		!attachProduct.is_add_on && !isOneOffProduct({ product: attachProduct });

	if (!isMainRecurring) {
		return {
			currentCustomerProduct: undefined,
			scheduledCustomerProduct: undefined,
			planTiming: "immediate" as PlanTiming,
		};
	}

	const currentCustomerProduct = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: attachProduct.group,
		internalEntityId,
	});

	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: attachProduct.group,
		internalEntityId,
	});

	let planTiming: PlanTiming = "immediate";

	if (currentCustomerProduct) {
		const currentPrices = customerProductToEffectivePrices({
			customerProduct: currentCustomerProduct,
		});

		const isUpgrade = isProductUpgrade({
			prices1: currentPrices,
			prices2: productToEffectivePrices({ product: attachProduct }),
		});

		planTiming = isUpgrade ? "immediate" : "end_of_cycle";
	}

	if (planScheduleOverride) {
		planTiming = planScheduleOverride;
	}

	if (isCustomerProductAutumnManagedTrial(currentCustomerProduct)) {
		planTiming = "immediate";
	}

	return {
		currentCustomerProduct,
		scheduledCustomerProduct,
		planTiming,
	};
};
