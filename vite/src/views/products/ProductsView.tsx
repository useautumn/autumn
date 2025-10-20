"use client";

import { type AppEnv, keyToTitle } from "@autumn/shared";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import LoadingScreen from "../general/LoadingScreen";
import { FeaturesPage } from "./features/FeaturesPage";
import { ProductsContext } from "./ProductsContext";
import { ProductsPage } from "./products/ProductsPage";
import { RewardsPage } from "./rewards/RewardsPage";

function ProductsView({ env }: { env: AppEnv }) {
	const { queryStates, setQueryStates } = useAppQueryStates({
		defaultTab: "products",
	});

	const { isLoading: isProductsLoading } = useProductsQuery();
	const { isLoading: isFeaturesLoading } = useFeaturesQuery();
	const { isLoading: isRewardsLoading } = useRewardsQuery();

	if (isProductsLoading || isFeaturesLoading || isRewardsLoading)
		return <LoadingScreen />;

	const tab = queryStates.tab;
	return (
		<ProductsContext.Provider value={{}}>
			<div className="flex flex-col gap-4 h-fit relative w-full text-sm">
				<h1 className="text-xl font-medium shrink-0 pt-6 pl-10">
					{keyToTitle(tab, { exclusionMap: { products: "Plans" } })}
				</h1>

				{tab === "products" && <ProductsPage />}
				{tab === "features" && <FeaturesPage />}
				{tab === "rewards" && <RewardsPage />}
			</div>
		</ProductsContext.Provider>
	);
}

export default ProductsView;
