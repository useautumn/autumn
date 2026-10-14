import { useParams } from "react-router";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useCustomerProductsPageQuery } from "../../hooks/useCustomerProductsPageQuery";
import { useCustomerProductsTableState } from "../../hooks/useCustomerProductsTableState";

/**
 * The entity view's Plans and Licenses sections fetch their own data, so start
 * those queries alongside the customer query and let the page render once.
 */
export const usePreloadEntityView = ({
	entityId,
}: {
	entityId: string | null;
}) => {
	const { customer_id } = useParams();
	const enabled = Boolean(entityId);

	const { currentCursor, pageSize, statuses, kind } =
		useCustomerProductsTableState({ entityId });
	const plansPage = useCustomerProductsPageQuery({
		cursor: currentCursor,
		pageSize,
		statuses,
		kind,
		enabled,
	});
	const balances = useLicenseBalancesQuery({
		customerId: customer_id,
		entityId: entityId ?? undefined,
		enabled,
	});
	const licenseProducts = useLicenseProductsQuery({ enabled });

	return {
		isLoading:
			enabled &&
			(plansPage.isLoading || balances.isLoading || licenseProducts.isLoading),
	};
};
