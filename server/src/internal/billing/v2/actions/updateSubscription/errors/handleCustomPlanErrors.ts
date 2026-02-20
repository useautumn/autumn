import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	cusProductToProduct,
	productsAreSame,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { hasCustomItems } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const handleCustomPlanErrors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: UpdateSubscriptionV1Params;
}) => {
	if (!hasCustomItems(params.customize)) return;

	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	const currentCustomerProduct = billingContext.customerProduct;

	const currentFullProduct = cusProductToProduct({
		cusProduct: currentCustomerProduct,
	});

	const newFullProduct = cusProductToProduct({
		cusProduct: newCustomerProduct,
	});

	const { itemsSame, onlyEntsChanged } = productsAreSame({
		curProductV1: currentFullProduct,
		newProductV1: newFullProduct,
		features: ctx.features,
	});

	if (itemsSame) {
		throw new RecaseError({
			message:
				"Cannot update to custom plan because the configuration (features and prices) are the same as the existing product",
		});
	}

	if (onlyEntsChanged && billingContext.invoiceMode) {
		throw new RecaseError({
			message:
				"Cannot create an invoice for this subscription update because there are no billing changes.",
		});
	}
};
