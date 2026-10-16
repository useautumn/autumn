import { AppEnv } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

/** Rules are always live, so their plans and features come from live whatever env the dashboard is in. */
export const useApprovalsCatalog = () => {
	const { products } = useProductsQuery({ env: AppEnv.Live });
	const { features } = useFeaturesQuery({ env: AppEnv.Live });
	return { products, features };
};
