import type { SyncProposalV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { syncProposalToCustomerState } from "../syncProposalToCustomerState";

export const useProposalCustomerState = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}) => {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer, entityId } = useCustomerContext();

	return syncProposalToCustomerState({
		proposal,
		customerProducts: customer?.customer_products ?? [],
		entities: customer?.entities ?? [],
		contextEntityId: entityId,
		products,
		features,
	});
};
