"use client";

import LoadingScreen from "../general/LoadingScreen";

import { useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { Product } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import { Tabs } from "@/components/ui/tabs";
import { useQueryState } from "nuqs";
import { useSecondaryTab } from "@/hooks/common/useSecondaryTab";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductsPage } from "./products/ProductsPage";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeaturesPage } from "./features/FeaturesPage";
import { RewardsPage } from "./rewards/RewardsPage";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";

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
				<h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Products</h1>

				{tab === "products" && <ProductsPage />}
				{tab === "features" && <FeaturesPage />}
				{tab === "rewards" && <RewardsPage />}
			</div>
		</ProductsContext.Provider>
	);
}

export default ProductsView;
