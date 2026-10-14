import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useCustomerProductsPageQuery } from "../../hooks/useCustomerProductsPageQuery";
import { useCustomerProductsTableState } from "../../hooks/useCustomerProductsTableState";

/**
 * The entity view's Plans and Licenses sections fetch their own data, so start
 * those queries alongside the customer query and let the page render once.
 */
export const usePreloadEntityView = ({
	customerId,
	entityId,
}: {
	customerId: string | undefined;
	entityId: string | null;
}) => {
	const enabled = Boolean(customerId && entityId);

	const { currentCursor, pageSize, statuses, kind } =
		useCustomerProductsTableState({ entityId });
	const plansPage = useCustomerProductsPageQuery({
		cursor: currentCursor,
		pageSize,
		statuses,
		kind,
		enabled,
		customerId,
	});
	const balances = useLicenseBalancesQuery({
		customerId,
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
