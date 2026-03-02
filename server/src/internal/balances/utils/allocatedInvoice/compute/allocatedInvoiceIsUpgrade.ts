import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";

export const allocatedInvoiceIsUpgrade = ({
	billingContext,
}: {
	billingContext: AllocatedInvoiceContext;
}) => {
	const { previousUsage, newUsage } = billingContext;

	return newUsage > previousUsage;
};
