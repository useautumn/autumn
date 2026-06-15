import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	cusProductToProduct,
	DocsLinks,
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

	const newCustomerProduct =
		billingContext.patchContext?.finalCustomerProduct ??
		autumnBillingPlan.insertCustomerProducts?.[0];
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
				"Custom plan configuration is identical to the current subscription; no update is needed",
			statusCode: 400,
			docsUrl: DocsLinks.UpdatingSubscriptions,
		});
	}

	if (onlyEntsChanged && billingContext.invoiceMode) {
		throw new RecaseError({
			message:
				"Cannot create an invoice for this subscription update because there are no billing changes.",
			statusCode: 400,
			docsUrl: DocsLinks.SkippingCharges,
		});
	}
};
