import { setupAttachTransitionContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachTransitionContext";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const setupUpgradeDowngradeBillingContext = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	// Grab current customer product?
	const {
		customer: fullCustomer,
		products: [attachProduct],
	} = attachParams;

	const { currentCustomerProduct } = setupAttachTransitionContext({
		fullCustomer,
		attachProduct,
	});

	return currentCustomerProduct;
};
