import {
	cusProductToProduct,
	isCustomerProductOneOff,
	isCustomerProductPaidRecurring,
	isOneOffPrice,
	productsAreSame,
	RecaseError,
} from "@autumn/shared";
import { cusProductToPrices } from "@shared/utils/cusProductUtils/convertCusProduct";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

export const handleOneOffErrors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { customerProduct } = billingContext;

	// Only apply these checks to one-off products
	if (!isCustomerProductOneOff(customerProduct)) return;

	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) return;

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	const newFullProduct = cusProductToProduct({
		cusProduct: newCustomerProduct,
	});

	const { onlyEntsChanged } = productsAreSame({
		curProductV1: currentFullProduct,
		newProductV1: newFullProduct,
		features: ctx.features,
	});

	if (!onlyEntsChanged) {
		throw new RecaseError({
			message:
				"When updating a one-off plan, price / billing changes are not allowed.",
		});
	}
};

/** Don't allow removing a trial from a paid recurring product when adding one-off items */
export const checkTrialRemovalWithOneOffItems = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const isPaidRecurring = isCustomerProductPaidRecurring(
		billingContext.customerProduct,
	);

	if (!isPaidRecurring) return;

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (!isTrialing || willBeTrialing) return;

	const newCustomerProducts = autumnBillingPlan.insertCustomerProducts;
	const newPrices = newCustomerProducts.flatMap((customerProduct) =>
		cusProductToPrices({ cusProduct: customerProduct }),
	);
	const newHasOneOffPrices = newPrices.some(isOneOffPrice);

	if (newHasOneOffPrices) {
		throw new RecaseError({
			message:
				"Cannot remove trial from a paid recurring subscription when adding one-off items.",
		});
	}
};
